#!/usr/bin/env node
// Phase 1 verification suite. NOT counted toward source budget.
// Covers: functional, edge cases, error handling, performance, determinism.
//
// Run: node tests/test-phase1.mjs
// Exit code: 0 = all green, 1 = any test failed.

import { writeFileSync, existsSync, mkdirSync, rmSync, statSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

import { run, format } from '../engine.js';
import { validate, rules } from '../rules.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TMP  = join(ROOT, 'tmp-tests');

if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

let passed = 0, failed = 0;
const fails = [];

const C = {
  green: '\x1b[32m', red: '\x1b[31m', dim: '\x1b[2m',
  bold: '\x1b[1m', yellow: '\x1b[33m', cyan: '\x1b[36m', reset: '\x1b[0m',
};

function ok(name, extra = '') {
  passed++;
  console.log(`  ${C.green}✓${C.reset} ${name}${extra ? C.dim + '  ' + extra + C.reset : ''}`);
}
function bad(name, why) {
  failed++;
  fails.push({ name, why });
  console.log(`  ${C.red}✗ ${name}${C.reset}\n      ${C.red}${why}${C.reset}`);
}
function section(title) {
  console.log('');
  console.log(`${C.bold}${C.cyan}── ${title}${C.reset}`);
}
function preview(s, max = 60) {
  if (s.length <= max) return s;
  return s.slice(0, max) + `… (${s.length} chars)`;
}
function assertEq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) ok(label, `= ${preview(e)}`);
  else bad(label, `expected ${preview(e)}, got ${preview(a)}`);
}
function assertTrue(cond, label, hint = '') {
  if (cond) ok(label, hint);
  else bad(label, hint || 'condition was falsy');
}

function writeJsonl(name, lines) {
  const p = join(TMP, name);
  writeFileSync(p, lines.map(l => typeof l === 'string' ? l : JSON.stringify(l)).join('\n') + '\n');
  return p;
}

// ─────────────────────────────────────────────────────────────────────────
section('rules.js — pure validator unit tests');

{
  const s = new Map([['alice', 100]]);
  assertTrue(validate({ type: 'deposit', user: 'bob', amount: 50 }, s) === null,
    'valid deposit accepted');
  assertEq(validate({ type: 'deposit', user: 'bob', amount: 0 }, s)?.rule,
    'amount_positive', 'zero deposit rejected');
  assertEq(validate({ type: 'deposit', user: 'bob', amount: -5 }, s)?.rule,
    'amount_positive', 'negative deposit rejected');
  assertEq(validate({ type: 'deposit', user: '', amount: 5 }, s)?.rule,
    'user_present', 'empty user rejected');
  assertEq(validate({ type: 'deposit', amount: 5 }, s)?.rule,
    'user_present', 'missing user rejected');

  assertTrue(validate({ type: 'transfer', from: 'alice', to: 'bob', amount: 50 }, s) === null,
    'valid transfer accepted');
  assertEq(validate({ type: 'transfer', from: 'alice', to: 'bob', amount: 200 }, s)?.rule,
    'sufficient', 'overdraft rejected');
  assertEq(validate({ type: 'transfer', from: 'ghost', to: 'bob', amount: 10 }, s)?.rule,
    'sender_exists', 'unknown sender rejected');
  assertEq(validate({ type: 'transfer', from: 'alice', to: 'alice', amount: 10 }, s)?.rule,
    'not_self', 'self-transfer rejected');
  assertEq(validate({ type: 'transfer', from: 'alice', amount: 10 }, s)?.rule,
    'to_present', 'missing recipient rejected');
  assertEq(validate({ type: 'transfer', from: 'alice', to: 'bob', amount: NaN }, s)?.rule,
    'amount_positive', 'NaN amount rejected');
  assertEq(validate({ type: 'transfer', from: 'alice', to: 'bob', amount: Infinity }, s)?.rule,
    'amount_positive', 'Infinity amount rejected');

  assertEq(validate({ type: 'unknown_op' }, s)?.rule, 'unknown_type', 'unknown event type rejected');
  assertEq(validate({}, s)?.rule, 'missing_type', 'missing type rejected');
  assertEq(validate(null, s)?.rule, 'not_object', 'null event rejected');
  assertEq(validate('string', s)?.rule, 'not_object', 'non-object event rejected');
  assertEq(validate({ type: 123 }, s)?.rule, 'missing_type', 'numeric type rejected');

  assertTrue(rules.deposit && Array.isArray(rules.deposit.validate) && typeof rules.deposit.apply === 'function',
    'rules export shape: deposit has validate[] + apply()');
  assertTrue(rules.transfer && Array.isArray(rules.transfer.validate) && typeof rules.transfer.apply === 'function',
    'rules export shape: transfer has validate[] + apply()');
}

// ─────────────────────────────────────────────────────────────────────────
section('engine.js — functional correctness');

{
  // Hand-crafted scenario with known answer.
  const p = writeJsonl('basic.jsonl', [
    { type: 'deposit',  user: 'alice', amount: 1000 },
    { type: 'deposit',  user: 'bob',   amount: 500  },
    { type: 'transfer', from: 'alice', to: 'bob', amount: 300 },
    { type: 'transfer', from: 'bob',   to: 'alice', amount: 100 },
    { type: 'transfer', from: 'bob',   to: 'alice', amount: 9999 }, // insufficient
  ]);
  const r = await run(p);
  assertEq(r.state.get('alice'), 800, 'alice final balance correct');
  assertEq(r.state.get('bob'),   700, 'bob final balance correct');
  assertEq(r.stats.processed, 5,  'processed counts every line');
  assertEq(r.stats.valid,     4,  'valid count correct');
  assertEq(r.stats.invalid,   1,  'invalid count correct');
  assertEq(r.stats.corrupt,   0,  'corrupt count zero on clean input');
  assertEq(r.errors.length,   1,  'one error captured');
  assertEq(r.errors[0].reason, 'sufficient', 'rejection reason recorded');
}

{
  // Conservation: total tokens minted via deposits must equal sum of state.
  const lines = [];
  let minted = 0;
  for (let i = 0; i < 200; i++) { lines.push({ type: 'deposit', user: `u${i % 10}`, amount: 7 }); minted += 7; }
  for (let i = 0; i < 500; i++) lines.push({ type: 'transfer', from: `u${i % 10}`, to: `u${(i + 1) % 10}`, amount: 1 });
  const p = writeJsonl('conservation.jsonl', lines);
  const r = await run(p);
  const total = [...r.state.values()].reduce((a, b) => a + b, 0);
  assertEq(total, minted, 'token conservation across transfers');
}

// ─────────────────────────────────────────────────────────────────────────
section('engine.js — fault tolerance / edge cases');

{
  const p = writeJsonl('corrupt.jsonl', [
    '{"type":"deposit","user":"alice","amount":100}',
    '{"type":"deposit","user":"bob"',                  // truncated
    'this is not json at all',                         // garbage
    '{"type":"deposit","user":"carol","amount":50}',
    '',                                                // empty line
    '{}',                                              // missing type
    '{"type":"deposit"}',                              // missing required fields
    '{"type":"deposit","user":"dave","amount":25}',
  ]);
  const r = await run(p);
  // Empty lines are skipped silently and not counted as processed.
  assertEq(r.stats.processed, 7, 'empty lines skipped from processed count');
  assertEq(r.stats.corrupt,   2, 'two corrupt lines detected');
  assertEq(r.stats.valid,     3, 'three valid deposits applied');
  assertEq(r.stats.invalid,   2, 'two invalid (missing fields) rejected');
  assertEq(r.state.get('alice'), 100, 'alice deposited despite later corruption');
  assertEq(r.state.get('dave'),  25,  'dave deposited despite earlier corruption');
  assertTrue(!r.state.has('bob'), 'bob never set (his line was corrupt)');
  assertTrue(r.errors.some(e => e.reason === 'corrupt_json'), 'corrupt_json reason recorded');
}

{
  const p = writeJsonl('empty.jsonl', []);
  const r = await run(p);
  assertEq(r.stats.processed, 0, 'empty file: zero processed');
  assertEq(r.stats.valid,     0, 'empty file: zero valid');
  assertEq(r.state.size,      0, 'empty file: empty state');
}

{
  // CRLF line endings — engine must handle Windows files identically.
  const p = join(TMP, 'crlf.jsonl');
  const lines = [
    JSON.stringify({ type: 'deposit', user: 'alice', amount: 50 }),
    JSON.stringify({ type: 'deposit', user: 'bob',   amount: 75 }),
  ];
  writeFileSync(p, lines.join('\r\n') + '\r\n');
  const r = await run(p);
  assertEq(r.stats.valid, 2, 'CRLF endings parsed correctly');
  assertEq(r.state.get('alice'), 50, 'CRLF: alice deposited');
  assertEq(r.state.get('bob'),   75, 'CRLF: bob deposited');
}

{
  // Trailing newline / no trailing newline parity.
  const p1 = join(TMP, 'trail-yes.jsonl');
  const p2 = join(TMP, 'trail-no.jsonl');
  writeFileSync(p1, '{"type":"deposit","user":"x","amount":5}\n');
  writeFileSync(p2, '{"type":"deposit","user":"x","amount":5}');
  const r1 = await run(p1); const r2 = await run(p2);
  assertEq(r1.stats.valid, r2.stats.valid, 'trailing-newline parity');
  assertEq(r1.state.get('x'), r2.state.get('x'), 'trailing-newline state parity');
}

{
  // All-invalid file should not crash and should produce empty state.
  const p = writeJsonl('all-bad.jsonl', [
    'broken', 'also broken', '{}', '{"type":"nope"}',
  ]);
  const r = await run(p);
  assertEq(r.state.size, 0, 'all-invalid: empty state');
  assertTrue(r.stats.invalid + r.stats.corrupt === r.stats.processed,
    'all-invalid: every line accounted for');
}

{
  // Missing file path → engine throws a clear error (not a stack trace).
  let threw = false;
  try { await run(join(TMP, 'does-not-exist.jsonl')); }
  catch { threw = true; }
  assertTrue(threw, 'engine throws on missing file (caller can catch)');
}

{
  // MAX_STORED_ERRORS cap: errors array must not grow unbounded.
  const lines = [];
  for (let i = 0; i < 5000; i++) lines.push('garbage line ' + i);
  const p = writeJsonl('many-errors.jsonl', lines);
  const r = await run(p);
  assertEq(r.stats.corrupt, 5000, 'all 5000 corrupt lines counted');
  assertTrue(r.errors.length <= 1000, `errors array capped (got ${r.errors.length})`);
}

// ─────────────────────────────────────────────────────────────────────────
section('engine.js — async/streaming behaviour');

{
  // The engine must be an async function returning a Promise.
  const ret = run(writeJsonl('async-check.jsonl', [{ type: 'deposit', user: 'a', amount: 1 }]));
  assertTrue(ret instanceof Promise, 'run() returns a Promise (async-first)');
  await ret;
}

{
  // Memory test: a 1M-event file should NOT cause memory to balloon.
  // We sample heap before/after, run the engine, and assert the delta is
  // bounded relative to the file size (file is ~70 MB; if we were buffering
  // it all, RSS would jump by that much).
  const p = join(TMP, 'mem.jsonl');
  const N = 1_000_000;
  // Generate via demo-gen for realism.
  const gen = spawnSync(process.execPath, ['demo-gen.js', String(N), p, '13'], {
    cwd: ROOT, encoding: 'utf8',
  });
  assertEq(gen.status, 0, 'demo-gen produced 1M events');
  const fileMB = statSync(p).size / 1024 / 1024;

  global.gc?.(); // best-effort
  const before = process.memoryUsage().heapUsed;
  const t0 = performance.now();
  const r = await run(p);
  const tMs = performance.now() - t0;
  const after = process.memoryUsage().heapUsed;
  const heapDeltaMB = (after - before) / 1024 / 1024;

  assertEq(r.stats.processed, N, '1M events processed');
  assertTrue(tMs < 10_000, `1M events in under 10s (got ${tMs.toFixed(0)}ms)`,
    `file ${fileMB.toFixed(1)} MB`);
  // Streaming proof: heap delta should be a tiny fraction of file size.
  // State Map dominates (1000 wallets × small entry), not the file content.
  assertTrue(heapDeltaMB < fileMB,
    `heap growth (${heapDeltaMB.toFixed(1)} MB) << file size (${fileMB.toFixed(1)} MB)`,
    'streaming, not buffering');
  console.log(`      ${C.dim}throughput: ${Math.round(N / (tMs / 1000)).toLocaleString()} events/sec${C.reset}`);
}

// ─────────────────────────────────────────────────────────────────────────
section('engine.js — performance constraint (<2s budget)');

{
  // The hackathon constraint is "respond in under 2 seconds". For the
  // walking skeleton we treat that as: a 100k-event file (a realistic
  // small-to-mid demo size) must finish within 2000 ms.
  const p = join(TMP, 'perf.jsonl');
  const gen = spawnSync(process.execPath, ['demo-gen.js', '100000', p, '99'], {
    cwd: ROOT, encoding: 'utf8',
  });
  assertEq(gen.status, 0, 'demo-gen produced 100k events for perf test');
  const t0 = performance.now();
  const r = await run(p);
  const ms = performance.now() - t0;
  assertEq(r.stats.processed, 100_000, '100k events processed');
  assertTrue(ms < 2000, `100k events in under 2s (got ${ms.toFixed(0)}ms)`);
  const tput = Math.round(100_000 / (ms / 1000));
  console.log(`      ${C.dim}throughput: ${tput.toLocaleString()} events/sec${C.reset}`);
}

// ─────────────────────────────────────────────────────────────────────────
section('demo-gen.js — generator behaviour');

{
  const p = join(TMP, 'gen.jsonl');
  const r1 = spawnSync(process.execPath, ['demo-gen.js', '1000', p, '42'],
    { cwd: ROOT, encoding: 'utf8' });
  assertEq(r1.status, 0, 'demo-gen exits 0');
  const lines = readFileSync(p, 'utf8').split('\n').filter(Boolean);
  assertEq(lines.length, 1000, 'demo-gen wrote requested count');

  // Determinism: same seed should produce identical output.
  const p2 = join(TMP, 'gen2.jsonl');
  spawnSync(process.execPath, ['demo-gen.js', '1000', p2, '42'],
    { cwd: ROOT, encoding: 'utf8' });
  assertEq(readFileSync(p, 'utf8'), readFileSync(p2, 'utf8'),
    'same seed → identical output (deterministic)');

  // Different seed should diverge.
  const p3 = join(TMP, 'gen3.jsonl');
  spawnSync(process.execPath, ['demo-gen.js', '1000', p3, '999'],
    { cwd: ROOT, encoding: 'utf8' });
  assertTrue(readFileSync(p, 'utf8') !== readFileSync(p3, 'utf8'),
    'different seed → different output');

  // Run the engine on it and confirm we get a mix of corrupt/invalid/valid.
  const er = await run(p);
  assertTrue(er.stats.valid > 0,   'demo data produces some valid events');
  assertTrue(er.stats.invalid > 0, 'demo data produces some invalid events');
  assertTrue(er.stats.corrupt > 0 || lines.length < 100,
    'demo data produces some corrupt lines (at scale)');
}

// ─────────────────────────────────────────────────────────────────────────
section('CLI integration');

{
  // Run engine.js as a subprocess to verify the CLI entry path.
  const p = writeJsonl('cli.jsonl', [
    { type: 'deposit', user: 'a', amount: 10 },
    { type: 'deposit', user: 'b', amount: 20 },
  ]);
  const cli = spawnSync(process.execPath, ['engine.js', p],
    { cwd: ROOT, encoding: 'utf8' });
  assertEq(cli.status, 0, 'CLI exits 0 on success');
  assertTrue(cli.stdout.includes('Chronofold — done'), 'CLI prints summary header');
  assertTrue(cli.stdout.includes('Processed       2'),  'CLI summary shows 2 processed');
  assertTrue(cli.stdout.includes('valid         2'),    'CLI summary shows 2 valid');

  const noArgs = spawnSync(process.execPath, ['engine.js'],
    { cwd: ROOT, encoding: 'utf8' });
  assertEq(noArgs.status, 1, 'CLI exits 1 when no path given');
  assertTrue(noArgs.stderr.includes('Usage'), 'CLI prints usage on missing arg');

  const bad = spawnSync(process.execPath, ['engine.js', join(TMP, 'nope.jsonl')],
    { cwd: ROOT, encoding: 'utf8' });
  assertEq(bad.status, 2, 'CLI exits 2 on engine error');
  assertTrue(bad.stderr.includes('engine error:'), 'CLI prints clean error message');

  // format() should produce consistent multi-line output.
  const result = await run(p);
  const txt = format(result);
  assertTrue(txt.includes('Throughput'), 'format() includes throughput line');
  assertTrue(txt.includes('Top entities'), 'format() includes top-entities section');
}

// ─────────────────────────────────────────────────────────────────────────
// Cleanup
rmSync(TMP, { recursive: true, force: true });

console.log('');
console.log(`${C.bold}Result: ${passed} passed, ${failed} failed${C.reset}`);
console.log('');

if (failed > 0) {
  console.log(`${C.red}${C.bold}FAIL${C.reset}`);
  for (const f of fails) console.log(`  - ${f.name}: ${f.why}`);
  process.exit(1);
}
console.log(`${C.green}${C.bold}PASS${C.reset}`);
process.exit(0);
