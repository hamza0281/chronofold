#!/usr/bin/env node
// demo-gen.js [count] [out] [seed] [scenario] — scenarios: crypto|banking|inventory
import { createWriteStream } from 'node:fs';
const N = +process.argv[2] || 100_000, OUT = process.argv[3] || 'demo.jsonl';
let seed = (+process.argv[4] || 42) >>> 0; const scen = process.argv[5] || 'crypto';
const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const pick = (a) => a[Math.floor(rand() * a.length)];
const users = Array.from({ length: 1000 }, (_, i) => `acct_${i.toString(16).padStart(4, '0')}`);
const SCEN = {
  crypto:    ['mint',    'burn',     'transfer', 1000, 200],
  banking:   ['deposit', 'withdraw', 'transfer', 5000, 1000],
  inventory: ['mint',    'withdraw', 'transfer', 200,  30],
};
const [credit, debit, pair, cMax, pMax] = SCEN[scen] || SCEN.crypto;
const sink = OUT === '-' ? process.stdout : createWriteStream(OUT), w = (s) => sink.write(s + '\n');
for (let i = 0; i < N; i++) {
  const x = rand();
  if (x < 0.001)      w(`{"type":"${pair}","from":"${pick(users)},amount:`);
  else if (x < 0.006) w(JSON.stringify({ type: pair, from: pick(users), amount: 100 }));
  else if (x < 0.011) w(JSON.stringify({ type: debit, user: pick(users), amount: -50 }));
  else if (x < 0.31)  w(JSON.stringify({ type: credit, user: pick(users), amount: Math.floor(rand() * cMax) + 1 }));
  else {
    const from = pick(users); let to = pick(users);
    if (from === to) to = users[(users.indexOf(to) + 1) % users.length];
    w(JSON.stringify({ type: pair, from, to, amount: Math.floor(rand() * pMax) + 1 }));
  }
}
const finish = () => process.stderr.write(`generated ${N} ${scen} events → ${OUT === '-' ? 'stdout' : OUT}\n`);
if (sink === process.stdout) finish(); else sink.end(finish);
