#!/usr/bin/env node
// engine.js — Chronofold core.
// Streams a JSONL file line-by-line, parses, validates, and folds events
// into a Map-based state. Memory is constant regardless of file size.

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validate } from './rules.js';

const MAX_STORED_ERRORS = 1000;

export async function run(path) {
  const fileSize = (await stat(path)).size;
  const stream = createReadStream(path, { encoding: 'utf8' });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });

  const state = new Map();
  const stats = {
    processed: 0, valid: 0, invalid: 0, corrupt: 0,
    totalBytes: fileSize, elapsedMs: 0,
    byReason: Object.create(null),
  };
  const errors = [];
  const t0 = performance.now();

  let lineNo = 0;
  for await (const raw of lines) {
    lineNo++;
    if (raw.length === 0) continue;
    stats.processed++;

    let event;
    try { event = JSON.parse(raw); }
    catch {
      stats.corrupt++;
      stats.byReason.corrupt_json = (stats.byReason.corrupt_json || 0) + 1;
      if (errors.length < MAX_STORED_ERRORS) errors.push({ line: lineNo, reason: 'corrupt_json', raw: raw.slice(0, 80) });
      continue;
    }

    const fail = validate(event, state);
    if (fail) {
      stats.invalid++;
      const key = `${fail.type}:${fail.rule}`;
      stats.byReason[key] = (stats.byReason[key] || 0) + 1;
      if (errors.length < MAX_STORED_ERRORS) errors.push({ line: lineNo, reason: fail.rule, type: fail.type });
      continue;
    }

    apply(event, state);
    stats.valid++;
  }

  stats.elapsedMs = performance.now() - t0;
  return { state, stats, errors };
}

function apply(e, s) {
  if (e.type === 'deposit') {
    s.set(e.user, (s.get(e.user) ?? 0) + e.amount);
  } else if (e.type === 'transfer') {
    s.set(e.from, s.get(e.from) - e.amount);
    s.set(e.to, (s.get(e.to) ?? 0) + e.amount);
  }
}

function topN(state, n = 10) {
  return [...state.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function pad(s, n) { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); }

export function format({ state, stats }) {
  const ms = stats.elapsedMs;
  const tput = stats.elapsedMs > 0 ? Math.round(stats.processed / (stats.elapsedMs / 1000)) : 0;
  const out = [];
  out.push('');
  out.push('  Chronofold — done');
  out.push('  ' + '─'.repeat(56));
  out.push(`  Processed       ${stats.processed.toLocaleString()}`);
  out.push(`    valid         ${stats.valid.toLocaleString()}`);
  out.push(`    invalid       ${stats.invalid.toLocaleString()}`);
  out.push(`    corrupt       ${stats.corrupt.toLocaleString()}`);
  out.push(`  State entities  ${state.size.toLocaleString()}`);
  out.push(`  File bytes      ${stats.totalBytes.toLocaleString()}`);
  out.push(`  Elapsed         ${ms.toFixed(1)} ms`);
  out.push(`  Throughput      ${tput.toLocaleString()} events/sec`);
  out.push('');
  const reasons = Object.entries(stats.byReason).sort((a, b) => b[1] - a[1]);
  if (reasons.length > 0) {
    out.push('  Top rejection reasons');
    for (const [k, v] of reasons.slice(0, 6)) out.push(`    ${pad(k, 36)}${v.toLocaleString()}`);
    out.push('');
  }
  if (state.size > 0) {
    out.push('  Top entities by value');
    for (const [k, v] of topN(state)) out.push(`    ${pad(k, 24)}${v.toLocaleString()}`);
    out.push('');
  }
  return out.join('\n');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const path = process.argv[2];
  if (!path) {
    process.stderr.write('Usage: node engine.js <path-to-events.jsonl>\n');
    process.exit(1);
  }
  try {
    const result = await run(path);
    process.stdout.write(format(result) + '\n');
  } catch (err) {
    process.stderr.write(`engine error: ${err.message}\n`);
    process.exit(2);
  }
}

// Silence unused-import warnings in some environments.
void fileURLToPath;
