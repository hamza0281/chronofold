#!/usr/bin/env node
// server.js — HTTP host: GET /, POST /run {path}, GET /events/:id (SSE), GET /state/:id.
import { createServer } from 'node:http';
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runStream } from './engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 7777;
export const runs = new Map();

const send = (res, s, b, h = {}) => {
  res.writeHead(s, { 'content-type': 'application/json; charset=utf-8', ...h });
  res.end(typeof b === 'string' ? b : JSON.stringify(b));
};
const broadcast = (rec, ev) => { rec.events.push(ev); for (const fn of rec.listeners) fn(ev); };
async function readBody(req) {
  const c = []; let n = 0;
  for await (const x of req) { n += x.length; if (n > 1 << 20) throw new Error('body too large'); c.push(x); }
  return Buffer.concat(c).toString('utf8');
}

export function startRun(absPath) {
  const id = randomUUID();
  const rec = { events: [], done: false, listeners: new Set(), result: null, error: null };
  runs.set(id, rec);
  (async () => {
    try {
      for await (const ev of runStream(absPath)) {
        broadcast(rec, ev);
        if (ev.type === 'done') rec.result = { state: [...ev.state.entries()], errors: ev.errors, stats: ev.stats };
      }
    } catch (err) {
      rec.error = err.message;
      broadcast(rec, { type: 'error', message: err.message });
    } finally {
      rec.done = true;
      for (const fn of rec.listeners) fn({ type: 'close' });
    }
  })();
  return id;
}

function sse(req, res, id) {
  const rec = runs.get(id);
  if (!rec) return send(res, 404, { error: 'unknown run' });
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'connection': 'keep-alive', 'x-accel-buffering': 'no' });
  const w = (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
  for (const ev of rec.events) w(ev);
  if (rec.done) return res.end();
  const fn = (ev) => { w(ev); if (ev.type === 'close') res.end(); };
  rec.listeners.add(fn);
  req.on('close', () => rec.listeners.delete(fn));
}

export const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, `http://${req.headers.host}`).pathname;
    if (req.method === 'GET' && path === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(await readFile(join(__dirname, 'dashboard.html'), 'utf8'));
    }
    if (req.method === 'POST' && path === '/run') {
      const p = String(JSON.parse(await readBody(req)).path || '');
      const abs = isAbsolute(p) ? p : resolve(process.cwd(), p);
      if (!existsSync(abs) || !statSync(abs).isFile()) return send(res, 400, { error: 'file not found' });
      return send(res, 200, { runId: startRun(abs), path: abs });
    }
    const m = path.match(/^\/(events|state)\/([0-9a-f-]+)$/i);
    if (req.method === 'GET' && m) {
      if (m[1] === 'events') return sse(req, res, m[2]);
      const rec = runs.get(m[2]);
      if (!rec) return send(res, 404, { error: 'unknown run' });
      if (!rec.done) return send(res, 202, { status: 'running' });
      return rec.error ? send(res, 500, { error: rec.error }) : send(res, 200, rec.result);
    }
    send(res, 404, { error: 'not found' });
  } catch (err) { send(res, 400, { error: err.message }); }
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.listen(PORT, () => process.stdout.write(`Chronofold dashboard ready → http://localhost:${PORT}\n`));
}
