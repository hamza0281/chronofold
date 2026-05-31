// Quick probe: mixed-event-type file run through the engine via run().
// Demonstrates that mint / withdraw / burn / transfer all flow through the
// same generic dispatch with zero engine code changes.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { run, format } from '../engine.js';

const path = resolve('demo-mixed.jsonl');
const lines = [];
const users = Array.from({length: 100}, (_, i) => `acct_${i}`);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// A realistic mix: 30% mint, 5% burn, 5% withdraw, 60% transfer.
for (let i = 0; i < 200_000; i++) {
  const r = Math.random();
  if (r < 0.30)      lines.push(JSON.stringify({ type: 'mint',     user: pick(users), amount: Math.floor(Math.random()*500)+1 }));
  else if (r < 0.35) lines.push(JSON.stringify({ type: 'burn',     user: pick(users), amount: Math.floor(Math.random()*30)+1 }));
  else if (r < 0.40) lines.push(JSON.stringify({ type: 'withdraw', user: pick(users), amount: Math.floor(Math.random()*30)+1 }));
  else {
    let from = pick(users), to = pick(users);
    if (from === to) to = users[(users.indexOf(to)+1) % users.length];
    lines.push(JSON.stringify({ type: 'transfer', from, to, amount: Math.floor(Math.random()*50)+1 }));
  }
}
writeFileSync(path, lines.join('\n') + '\n');
console.log(`generated ${lines.length} events → ${path}`);

const t0 = Date.now();
const result = await run(path);
console.log(format(result));
console.log(`wall-time: ${Date.now() - t0} ms`);
