#!/usr/bin/env node
// demo-gen.js — synthetic event generator for Chronofold.
// Usage: node demo-gen.js [count=100000] [out=demo.jsonl] [seed=42]
// Pass '-' as out to write to stdout. Output is deterministic per seed.

import { createWriteStream } from 'node:fs';

const N = Number(process.argv[2]) || 100_000;
const OUT = process.argv[3] || 'demo.jsonl';
let seed = (Number(process.argv[4]) || 42) >>> 0;

// Mulberry-style LCG. Tiny, deterministic, good enough for synthetic data.
const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const users = Array.from({ length: 1000 }, (_, i) => `wallet_${i.toString(16).padStart(4, '0')}`);
const sink = OUT === '-' ? process.stdout : createWriteStream(OUT);
const writeLine = (s) => sink.write(s + '\n');

let written = 0;
for (let i = 0; i < N; i++) {
  const r = rand();
  if (r < 0.001)      writeLine('{"type":"transfer","from":"' + pick(users) + ',amount:'); // 0.1% corrupt
  else if (r < 0.006) writeLine(JSON.stringify({ type: 'transfer', from: pick(users), amount: 100 })); // 0.5% missing 'to'
  else if (r < 0.011) writeLine(JSON.stringify({ type: 'transfer', from: pick(users), to: pick(users), amount: -50 })); // 0.5% negative
  else if (r < 0.31)  writeLine(JSON.stringify({ type: 'deposit', user: pick(users), amount: Math.floor(rand() * 1000) + 1 }));
  else {
    let from = pick(users), to = pick(users);
    if (from === to) to = users[(users.indexOf(to) + 1) % users.length];
    writeLine(JSON.stringify({ type: 'transfer', from, to, amount: Math.floor(rand() * 200) + 1 }));
  }
  written++;
}

const finish = () => process.stderr.write(`generated ${written} events → ${OUT === '-' ? 'stdout' : OUT}\n`);
if (sink === process.stdout) finish(); else sink.end(finish);
