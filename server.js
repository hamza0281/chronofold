#!/usr/bin/env node
// server.js — GET /, POST /upload (raw body), POST /run {path}, GET /events|state|snapshot/:id
import { createServer } from 'node:http';
import { existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { runStream } from './engine.js';
import { SnapshotRing } from './snapshot.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 7777;
export const runs = new Map();

const send = (res, s, b, h = {}) => { res.writeHead(s, { 'content-type': 'application/json; charset=utf-8', ...h }); res.end(typeof b === 'string' ? b : JSON.stringify(b)); };
const broadcast = (rec, ev) => { rec.events.push(ev); for (const fn of rec.listeners) fn(ev); };
async function readBody(req, max = 200 << 20) {
  const c = []; let n = 0;
  for await (const x of req) { n += x.length; if (n > max) throw new Error('file too large'); c.push(x); }
  return Buffer.concat(c);
}

export function startRun(absPath) {
  const id = randomUUID(), ring = new SnapshotRing();
  const rec = { events: [], done: false, listeners: new Set(), result: null, error: null, ring };
  runs.set(id, rec);
  (async () => {
    try {
      for await (const ev of runStream(absPath, { ring })) {
        broadcast(rec, ev);
        if (ev.type === 'done') rec.result = { state: [...ev.state.entries()], errors: ev.errors, stats: ev.stats };
      }
    } catch (err) { rec.error = err.message; broadcast(rec, { type: 'error', message: err.message }); }
    finally { rec.done = true; for (const fn of rec.listeners) fn({ type: 'close' }); }
  })();
  return id;
}

function sse(req, res, rec) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'connection': 'keep-alive', 'x-accel-buffering': 'no' });
  const w = ev => res.write(`data: ${JSON.stringify(ev)}\n\n`);
  for (const ev of rec.events) w(ev);
  if (rec.done) return res.end();
  const fn = ev => { w(ev); if (ev.type === 'close') res.end(); };
  rec.listeners.add(fn); req.on('close', () => rec.listeners.delete(fn));
}

export const server = createServer(async (req, res) => {
  try {
    const p = new URL(req.url, `http://${req.headers.host}`).pathname;
    if (req.method === 'GET' && p === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(await readFile(join(__dirname, 'dashboard.html'), 'utf8')); }
    if (req.method === 'POST' && p === '/upload') {
      const buf = await readBody(req); const dir = join(tmpdir(), 'chronofold');
      mkdirSync(dir, { recursive: true }); const tmp = join(dir, randomUUID() + '.jsonl');
      writeFileSync(tmp, buf); return send(res, 200, { runId: startRun(tmp), size: buf.length });
    }
    if (req.method === 'POST' && p === '/run') {
      const body = JSON.parse((await readBody(req)).toString()); const abs = isAbsolute(body.path || '') ? body.path : resolve(process.cwd(), body.path || '');
      if (!existsSync(abs) || !statSync(abs).isFile()) return send(res, 400, { error: 'file not found' });
      return send(res, 200, { runId: startRun(abs), path: abs });
    }
    const m = p.match(/^\/(events|state|snapshot)\/([0-9a-f-]+)(?:\/(\d+))?$/i);
    if (req.method === 'GET' && m) {
      const rec = runs.get(m[2]); if (!rec) return send(res, 404, { error: 'unknown run' });
      if (m[1] === 'events') return sse(req, res, rec);
      if (m[1] === 'snapshot') return send(res, 200, { index: +m[3], state: [...rec.ring.stateAt(+m[3]).entries()] });
      if (!rec.done) return send(res, 202, { status: 'running' });
      return rec.error ? send(res, 500, { error: rec.error }) : send(res, 200, rec.result);
    }
    send(res, 404, { error: 'not found' });
  } catch (err) { send(res, 400, { error: err.message }); }
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.listen(PORT, '0.0.0.0', () => process.stdout.write(`Chronofold → http://0.0.0.0:${PORT}\n`));
}
