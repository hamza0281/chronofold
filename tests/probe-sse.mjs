// Live SSE probe — connects to a running server, runs a real file, prints every event.
import { resolve } from 'node:path';
const url = process.argv[2] || 'http://localhost:7777';
const file = resolve(process.argv[3] || 'demo-live.jsonl');

const start = await (await fetch(`${url}/run`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ path: file }),
})).json();
console.log('runId:', start.runId);

const r = await fetch(`${url}/events/${start.runId}`);
const reader = r.body.getReader();
const dec = new TextDecoder();
let buf = '', count = 0, doneEv = null, t0 = Date.now();
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  const parts = buf.split('\n\n'); buf = parts.pop() || '';
  for (const p of parts) {
    for (const line of p.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const ev = JSON.parse(line.slice(6));
      count++;
      if (ev.type === 'progress') {
        console.log(`+${(Date.now()-t0).toString().padStart(5)}ms  progress  processed=${ev.stats.processed}  valid=${ev.stats.valid}  top=${ev.top.length}`);
      } else if (ev.type === 'done') {
        doneEv = ev;
        console.log(`+${(Date.now()-t0).toString().padStart(5)}ms  DONE      processed=${ev.stats.processed}  valid=${ev.stats.valid}  invalid=${ev.stats.invalid}  corrupt=${ev.stats.corrupt}  ${ev.stats.elapsedMs.toFixed(1)}ms`);
      } else {
        console.log(`+${(Date.now()-t0).toString().padStart(5)}ms  ${ev.type}`);
      }
    }
  }
  if (doneEv) { reader.cancel().catch(()=>{}); break; }
}
// Give Node a tick to settle before exit (avoids a Windows libuv shutdown assertion).
await new Promise(r => setImmediate(r));
console.log(`\ntotal SSE events received: ${count}`);
process.exit(doneEv ? 0 : 1);
