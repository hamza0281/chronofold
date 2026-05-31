#!/usr/bin/env node
// Phase 5 verification suite. Off-budget. Covers polish:
//  - demo-gen.js scenarios (crypto / banking / inventory) with deterministic output
//  - dashboard polish: counter tween, export buttons, byReason summary, scenario hint
//  - README has hero + quick start + line-count badge
//  - line budget under 500 (final cap)

import { writeFileSync, existsSync, mkdirSync, rmSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { run } from '../engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TMP  = join(ROOT, 'tmp-tests-p5');
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

function genScenario(scenario, count, seed = 7) {
  const out = join(TMP, `${scenario}.jsonl`);
  const r = spawnSync(process.execPath, ['demo-gen.js', String(count), out, String(seed), scenario],
    { cwd: ROOT, encoding: 'utf8' });
  return { out, exit: r.status, stderr: r.stderr };
}

// ─────────────────────────────────────────────────────────────────────────
section('demo-gen.js — scenarios');
{
  const scenarios = ['crypto', 'banking', 'inventory'];
  for (const s of scenarios) {
    const r = genScenario(s, 5_000);
    assertEq(r.exit, 0, `demo-gen ${s} exits 0`);
    assertTrue(r.stderr.includes(s), `demo-gen ${s} announces scenario in stderr`);
    const lines = readFileSync(r.out, 'utf8').split('\n').filter(Boolean);
    assertEq(lines.length, 5_000, `demo-gen ${s} writes 5000 lines`);
  }
}

{
  // Each scenario produces events appropriate to its domain.
  const ban = readFileSync(genScenario('banking', 5_000).out, 'utf8');
  assertTrue(ban.includes('"type":"deposit"'), 'banking includes deposit');
  assertTrue(ban.includes('"type":"withdraw"'), 'banking includes withdraw');
  assertTrue(ban.includes('"type":"transfer"'), 'banking includes transfer');

  const cry = readFileSync(genScenario('crypto', 5_000).out, 'utf8');
  assertTrue(cry.includes('"type":"mint"'),     'crypto includes mint');
  assertTrue(cry.includes('"type":"burn"'),     'crypto includes burn');
  assertTrue(cry.includes('"type":"transfer"'), 'crypto includes transfer');

  const inv = readFileSync(genScenario('inventory', 5_000).out, 'utf8');
  assertTrue(inv.includes('"type":"mint"'),     'inventory includes mint');
  assertTrue(inv.includes('"type":"withdraw"'), 'inventory includes withdraw');
  assertTrue(!inv.includes('"type":"deposit"'), 'inventory does NOT include deposit');
}

{
  // Determinism per scenario+seed combo.
  const a = readFileSync(genScenario('banking', 1000, 99).out, 'utf8');
  const b = readFileSync(genScenario('banking', 1000, 99).out, 'utf8');
  assertEq(a, b, 'banking + seed=99 deterministic');
  const c = readFileSync(genScenario('banking', 1000, 100).out, 'utf8');
  assertTrue(a !== c, 'different seed → different banking output');
  const d = readFileSync(genScenario('crypto', 1000, 99).out, 'utf8');
  assertTrue(a !== d, 'same seed, different scenario → different output');
}

{
  // Engine accepts every generated scenario without crashes; rejection counts realistic.
  for (const s of ['crypto', 'banking', 'inventory']) {
    const out = genScenario(s, 10_000, 42).out;
    const r = await run(out);
    assertEq(r.stats.processed, 10_000, `${s}: 10k events processed`);
    assertTrue(r.stats.valid > 7000,    `${s}: most events valid (got ${r.stats.valid})`);
    assertTrue(r.stats.corrupt > 0 || r.stats.invalid > 0, `${s}: some bad data injected`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
section('dashboard.html — polish hooks');
{
  const html = readFileSync(join(ROOT, 'dashboard.html'), 'utf8');
  // Counter tween
  assertTrue(html.includes('requestAnimationFrame'), 'dashboard uses requestAnimationFrame for tween');
  assertTrue(html.includes('sn(') || html.includes('setNum') || html.includes('function sn'), 'dashboard has setNum tween helper');
  // Export buttons
  assertTrue(html.includes('id="es"') || html.includes('id="exp-state"'), 'export-state button present');
  assertTrue(html.includes('id="ee"') || html.includes('id="exp-errs"'),  'export-errors button present');
  assertTrue(html.includes('state.json'),            'export wires state.json filename');
  assertTrue(html.includes('errors.csv'),            'export wires errors.csv filename');
  assertTrue(html.includes('Blob'),                  'uses Blob for download');
  // Grouped errors summary card
  assertTrue(html.includes('id="bylist"') || html.includes('bylist'), 'rejections-by-reason container present');
  assertTrue(html.includes('Rejections') || html.includes('by reason') || html.includes('byReason'), 'grouped-by-reason header present');
  assertTrue(html.includes('byReason') || html.includes('stats.byReason'), 'consumes stats.byReason');
  // Scenario hint visible to user
  assertTrue(html.includes('banking') && html.includes('crypto') && html.includes('inventory'),
    'scenario hint text present');
  // Theme intact
  assertTrue(html.includes('--bg:#EFE9DD'), 'warm parchment palette retained');
  // No external network deps
  assertTrue(!/<link[^>]+href=["']http/i.test(html), 'no external <link href=http>');
  assertTrue(!/<script[^>]+src=/i.test(html),         'no external <script src=>');
}

// ─────────────────────────────────────────────────────────────────────────
section('README.md — submission packet');
{
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  assertTrue(/^#\s+Chronofold/m.test(readme),     'README has top-level heading');
  assertTrue(readme.includes('Fold a million'),   'README includes tagline');
  assertTrue(/quick start/i.test(readme),         'README has quick start section');
  assertTrue(readme.includes('node demo-gen.js'), 'README shows demo-gen usage');
  assertTrue(readme.includes('node server.js'),   'README shows server start');
  assertTrue(/zero[\s-]dependencies/i.test(readme), 'README highlights zero deps');
  assertTrue(/500/.test(readme),                   'README mentions line cap');
  assertTrue(readme.includes('mint') || readme.includes('event'),
    'README mentions event types or events generally');
}

// ─────────────────────────────────────────────────────────────────────────
section('source — final line budget');
{
  const caps = {
    'engine.js': 150, 'dashboard.html': 150, 'server.js': 80,
    'rules.js': 50, 'snapshot.js': 40, 'demo-gen.js': 30,
  };
  const totalCap = Object.values(caps).reduce((a, b) => a + b, 0);
  let total = 0;
  for (const [f, cap] of Object.entries(caps)) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    const lines = src.split(/\r?\n/).filter(l => l.trim().length > 0).length;
    total += lines;
    assertTrue(lines <= cap, `${f} ≤ ${cap} lines (got ${lines})`);
  }
  assertTrue(total <= totalCap, `total ≤ ${totalCap} (got ${total})`);
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
