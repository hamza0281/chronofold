#!/usr/bin/env node
// Phase 3 verification suite. Off-budget. Covers:
//  - declarative rules.js shape (apply + validate per type)
//  - new event types: mint, burn, withdraw
//  - generic engine dispatch (no per-type code in engine.js)
//  - hardened fault tolerance (corrupt cap 100, total cap 10k, per-reason buckets)
//  - end-to-end conservation on a mixed-event domain

import { writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

import { run, runStream } from '../engine.js';
import { rules, validate, apply } from '../rules.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TMP  = join(ROOT, 'tmp-tests-p3');
if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

let passed = 0, failed = 0; const fails = [];
const C = { green:'\x1b[32m', red:'\x1b[31m', dim:'\x1b[2m', bold:'\x1b[1m', cyan:'\x1b[36m', reset:'\x1b[0m' };
const ok  = (n, e='') => { passed++; console.log(`  ${C.green}✓${C.reset} ${n}${e?C.dim+'  '+e+C.reset:''}`); };
const bad = (n, w)    => { failed++; fails.push({n,w}); console.log(`  ${C.red}✗ ${n}${C.reset}\n      ${C.red}${w}${C.reset}`); };
const section = t => { console.log(''); console.log(`${C.bold}${C.cyan}── ${t}${C.reset}`); };
const preview = (s, m=80) => { s = String(s); return s.length <= m ? s : s.slice(0,m) + `… (${s.length} chars)`; };
function assertEq(a, e, label) {
  const A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) ok(label, `= ${preview(E)}`); else bad(label, `expected ${preview(E)}, got ${preview(A)}`);
}
function assertTrue(c, label, hint='') { if (c) ok(label, hint); else bad(label, hint || 'condition was falsy'); }

function writeJsonl(name, lines) {
  const p = join(TMP, name);
  writeFileSync(p, lines.map(l => typeof l === 'string' ? l : JSON.stringify(l)).join('\n') + '\n');
  return p;
}

// ─────────────────────────────────────────────────────────────────────────
section('rules.js — declarative shape');
{
  for (const t of ['deposit', 'transfer', 'mint', 'burn', 'withdraw']) {
    assertTrue(rules[t] != null, `rules.${t} exists`);
    assertTrue(Array.isArray(rules[t].validate), `rules.${t}.validate is an array`);
    assertTrue(typeof rules[t].apply === 'function', `rules.${t}.apply is a function`);
  }
  assertTrue(typeof validate === 'function', 'validate() exported');
  assertTrue(typeof apply === 'function',    'apply() exported');
}

// ─────────────────────────────────────────────────────────────────────────
section('rules.js — new event types: mint, burn, withdraw');
{
  const s = new Map([['alice', 100]]);
  // mint = additive credit; behaves like deposit but is its own type for accounting
  assertTrue(validate({ type: 'mint', user: 'bob', amount: 50 }, s) === null, 'valid mint accepted');
  assertEq(validate({ type: 'mint', user: '', amount: 50 }, s)?.rule, 'user_present', 'mint: empty user rejected');
  assertEq(validate({ type: 'mint', user: 'bob', amount: 0 }, s)?.rule, 'amount_positive', 'mint: zero amount rejected');

  // withdraw = subtractive debit, requires existing balance
  assertTrue(validate({ type: 'withdraw', user: 'alice', amount: 50 }, s) === null, 'valid withdraw accepted');
  assertEq(validate({ type: 'withdraw', user: 'alice', amount: 200 }, s)?.rule, 'sufficient', 'withdraw: overdraft rejected');
  assertEq(validate({ type: 'withdraw', user: 'ghost', amount: 5 }, s)?.rule, 'user_exists', 'withdraw: unknown user rejected');

  // burn = subtractive debit (semantically: destroying tokens)
  assertTrue(validate({ type: 'burn', user: 'alice', amount: 25 }, s) === null, 'valid burn accepted');
  assertEq(validate({ type: 'burn', user: 'alice', amount: 1000 }, s)?.rule, 'sufficient', 'burn: insufficient rejected');
  assertEq(validate({ type: 'burn', user: 'ghost', amount: 1 }, s)?.rule, 'user_exists', 'burn: unknown user rejected');
}

// ─────────────────────────────────────────────────────────────────────────
section('engine — end-to-end with new event types');
{
  const p = writeJsonl('multi.jsonl', [
    { type: 'mint',     user: 'alice', amount: 1000 },
    { type: 'mint',     user: 'bob',   amount: 500 },
    { type: 'transfer', from: 'alice', to: 'bob', amount: 200 },
    { type: 'withdraw', user: 'bob',   amount: 100 },
    { type: 'burn',     user: 'alice', amount: 50 },
    { type: 'withdraw', user: 'bob',   amount: 9999 },           // insufficient
    { type: 'burn',     user: 'ghost', amount: 1 },              // unknown user
    { type: 'mint',     user: 'carol', amount: 0 },              // amount must be positive
  ]);
  const r = await run(p);
  // Math: alice = 1000 - 200 (transfer out) - 50 (burn) = 750
  //       bob   = 500  + 200 (transfer in) - 100 (withdraw) = 600
  //       carol = never created (mint rejected)
  assertEq(r.state.get('alice'), 750, 'alice = 750');
  assertEq(r.state.get('bob'),   600, 'bob = 600');
  assertTrue(!r.state.has('carol'), 'carol absent (rejected mint never created entry)');
  assertTrue(!r.state.has('ghost'), 'ghost absent (rejected burn never created entry)');
  assertEq(r.stats.processed, 8, 'processed = 8');
  assertEq(r.stats.valid,     5, 'valid = 5');
  assertEq(r.stats.invalid,   3, 'invalid = 3');
  // Rejection reasons must be tagged with their event type for grouping.
  assertTrue(r.stats.byReason['withdraw:sufficient'] === 1, 'byReason["withdraw:sufficient"] = 1');
  assertTrue(r.stats.byReason['burn:user_exists']    === 1, 'byReason["burn:user_exists"] = 1');
  assertTrue(r.stats.byReason['mint:amount_positive']=== 1, 'byReason["mint:amount_positive"] = 1');
}

// ─────────────────────────────────────────────────────────────────────────
section('engine — generic dispatch (zero engine changes for new types)');
{
  // The engine source must NOT contain hardcoded references to mint/burn/withdraw
  // (other than nothing — they live entirely in rules.js).
  const engineSrc = readFileSync(join(ROOT, 'engine.js'), 'utf8');
  for (const t of ['mint', 'burn', 'withdraw']) {
    assertTrue(!engineSrc.includes(`'${t}'`) && !engineSrc.includes(`"${t}"`),
      `engine.js does not hardcode "${t}" string`);
  }
  // engine should also not have a dispatch switch on event.type any more.
  assertTrue(!/switch\s*\(\s*e?\.type/.test(engineSrc),
    'engine.js has no switch-on-type (truly generic)');
  // Engine should not directly mutate state for any specific event type.
  assertTrue(!engineSrc.includes('s.set(e.from'),
    'engine.js does not encode transfer-specific state mutation');
}

// ─────────────────────────────────────────────────────────────────────────
section('engine — fault tolerance hardening');
{
  // 200 corrupt + 200 invalid + 5 valid: corrupt errors capped at 100,
  // total errors capped much higher (10k), but here we have 405 events total.
  const lines = [];
  for (let i = 0; i < 200; i++) lines.push('garbage line ' + i);
  for (let i = 0; i < 200; i++) lines.push({ type: 'transfer', from: 'a', to: 'b', amount: -1 });  // amount_positive fails
  for (let i = 0; i < 5;   i++) lines.push({ type: 'mint',     user: 'a', amount: 10 });
  const p = writeJsonl('mixed.jsonl', lines);
  const r = await run(p);
  assertEq(r.stats.corrupt, 200, 'all 200 corrupt counted');
  assertEq(r.stats.invalid, 200, 'all 200 invalid counted');
  assertEq(r.stats.valid,   5,   'all 5 valid applied');
  // Sub-cap on corrupt: at most 100 corrupt entries stored, but invalid entries should be present too.
  const storedCorrupt = r.errors.filter(e => e.reason === 'corrupt_json').length;
  const storedInvalid = r.errors.filter(e => e.reason !== 'corrupt_json').length;
  assertTrue(storedCorrupt <= 100, `stored corrupt errors capped at 100 (got ${storedCorrupt})`);
  assertEq(storedCorrupt, 100, 'exactly 100 corrupt rows stored (sub-cap enforced)');
  assertEq(storedInvalid, 200, 'all 200 invalid rows stored (under global cap)');
  // Per-reason buckets
  assertEq(r.stats.byReason.corrupt_json, 200, 'byReason.corrupt_json reflects ALL corrupt, not just stored');
  assertEq(r.stats.byReason['transfer:amount_positive'], 200, 'byReason["transfer:amount_positive"] = 200');
}

{
  // Global error cap: 12,000 invalid events should produce at most 10,000 stored errors,
  // but stats should still count all 12,000.
  const lines = [];
  for (let i = 0; i < 12_000; i++) lines.push({ type: 'transfer', from: 'x', to: 'y', amount: -1 });
  const p = writeJsonl('flood.jsonl', lines);
  const r = await run(p);
  assertEq(r.stats.invalid, 12_000, 'all 12k counted in stats');
  assertTrue(r.errors.length <= 10_000, `errors array capped at 10k (got ${r.errors.length})`);
  assertEq(r.errors.length, 10_000, 'exactly 10,000 errors stored');
  assertEq(r.stats.byReason['transfer:amount_positive'], 12_000, 'byReason still counts all 12k');
}

{
  // Conservation invariant on a mixed-domain workload:
  // total (mint - burn - withdraw) must equal sum of state values.
  const lines = [];
  let mint = 0, burn = 0, withdraw = 0;
  for (let i = 0; i < 100; i++) { lines.push({ type: 'mint',     user: `u${i % 10}`, amount: 100 }); mint += 100; }
  for (let i = 0; i < 30; i++)  { lines.push({ type: 'burn',     user: `u${i % 10}`, amount: 5 });   burn += 5; }
  for (let i = 0; i < 20; i++)  { lines.push({ type: 'withdraw', user: `u${i % 10}`, amount: 3 });   withdraw += 3; }
  for (let i = 0; i < 200; i++) lines.push({ type: 'transfer', from: `u${i % 10}`, to: `u${(i + 1) % 10}`, amount: 1 });
  const p = writeJsonl('conservation.jsonl', lines);
  const r = await run(p);
  const total = [...r.state.values()].reduce((a, b) => a + b, 0);
  assertEq(total, mint - burn - withdraw,
    `conservation: Σstate (${total}) == mint(${mint}) - burn(${burn}) - withdraw(${withdraw})`);
}

// ─────────────────────────────────────────────────────────────────────────
section('engine — performance still under constraint after refactor');
{
  // 100k events of mixed types must still finish under 2s.
  const lines = [];
  for (let i = 0; i < 100_000; i++) {
    if (i % 5 === 0)      lines.push({ type: 'mint',     user: `u${i % 1000}`, amount: 10 });
    else if (i % 5 === 1) lines.push({ type: 'burn',     user: `u${i % 1000}`, amount: 1 });
    else if (i % 5 === 2) lines.push({ type: 'withdraw', user: `u${i % 1000}`, amount: 1 });
    else                  lines.push({ type: 'transfer', from: `u${i % 1000}`, to: `u${(i+1) % 1000}`, amount: 1 });
  }
  const p = writeJsonl('perf.jsonl', lines);
  const t0 = Date.now();
  const r = await run(p);
  const ms = Date.now() - t0;
  assertEq(r.stats.processed, 100_000, '100k mixed events processed');
  assertTrue(ms < 2000, `mixed 100k events under 2s (got ${ms} ms)`);
}

// ─────────────────────────────────────────────────────────────────────────
section('runStream — declarative rules visible to streaming consumer');
{
  const p = writeJsonl('stream.jsonl', [
    { type: 'mint',     user: 'a', amount: 100 },
    { type: 'withdraw', user: 'a', amount: 30 },
    { type: 'burn',     user: 'a', amount: 20 },
  ]);
  let doneEv = null;
  for await (const ev of runStream(p, { interval: 1e9 })) if (ev.type === 'done') doneEv = ev;
  assertTrue(doneEv != null, 'runStream yields a done event');
  assertEq(doneEv.stats.valid, 3, 'all 3 events folded via runStream');
  assertEq(doneEv.state.get('a'), 50, 'a = 100 - 30 - 20 = 50');
}

// ─────────────────────────────────────────────────────────────────────────
rmSync(TMP, { recursive: true, force: true });

console.log('');
console.log(`${C.bold}Result: ${passed} passed, ${failed} failed${C.reset}`);
console.log('');
if (failed > 0) {
  console.log(`${C.red}${C.bold}FAIL${C.reset}`);
  for (const f of fails) console.log(`  - ${f.n}: ${f.w}`);
  process.exit(1);
}
console.log(`${C.green}${C.bold}PASS${C.reset}`);
process.exit(0);
