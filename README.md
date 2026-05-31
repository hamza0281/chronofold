# Chronofold

> **Fold a million events into one truth.**

A zero-dependency, fault-tolerant event-sourced state engine in vanilla JavaScript.
Streams a JSONL log of events — banking transactions, blockchain transfers,
inventory updates, game actions, IoT readings — validates them, and folds them
into a current state. Includes time-travel snapshots and a live browser dashboard.

Built for [Code Olympics 2026](https://codeolympics.com/2026) under the constraints:
**< 2 second response · 500 lines of source · vanilla JavaScript · data processing.**

---

## Highlights

- ⚡ **1 million events folded in under 2 seconds** on commodity hardware
- 🛡️ **Bulletproof against bad input** — corrupt JSON, missing fields, overdrafts, unknown event types — engine never crashes
- 🕰️ **Time travel** — query the full state at any prior event index in milliseconds
- 📡 **Live SSE dashboard** — counters update 10× per second while the engine processes
- 🧩 **Declarative rules** — add new event types by editing data, not code
- 📦 **Zero dependencies** — pure Node standard library + vanilla browser JS
- 📏 **462 / 500 lines of source** across the entire system

---

## Quick start

```bash
# Generate a deterministic demo file (scenarios: crypto | banking | inventory)
node demo-gen.js 1000000 demo.jsonl 42 banking

# Run the dashboard server (opens on http://localhost:7777)
node server.js

# Or process from the CLI
node engine.js demo.jsonl
```

Open `http://localhost:7777`, paste the absolute path to `demo.jsonl`, hit **Fold**.
Watch the counters race up, the leaderboard reshuffle, and rejections stream in
live. When the run finishes, drag the time-travel slider to any prior event index.

---

## Event types

Five built-in event types, all defined declaratively in `rules.js`:

| Type | Effect | Validation |
|---|---|---|
| `deposit` | credits a user | amount > 0, user present |
| `mint` | credits a user (token semantics) | amount > 0, user present |
| `withdraw` | debits a user | amount > 0, user must exist + have funds |
| `burn` | debits a user (token destruction) | amount > 0, user must exist + have funds |
| `transfer` | atomic debit + credit | amount > 0, sender exists with funds, distinct parties |

Adding a sixth type is one entry in `rules.js`. The engine never changes.

---

## Architecture

```
events.jsonl ─▶ stream ─▶ parse ─▶ validate ─▶ apply ─▶ snapshot ─▶ state
                  │         │         │          │          │
                  └ skip    └ skip    └ skip     └─ Map  ──── ring buffer
                    bad      bad        bad         update      every 10k
                    line     JSON       rule
                                                  ┌─ live SSE  ─▶ dashboard
                                                  └─ HTTP API  ─▶ /state, /snapshot
```

Six source files, hard cap of 500 lines total:

| File | Purpose | Lines |
|---|---|---|
| `engine.js` | streaming + parsing + folding loop | 129 / 150 |
| `dashboard.html` | UI (HTML + CSS + JS in one file) | 147 / 150 |
| `server.js` | HTTP host + SSE | 79 / 80 |
| `rules.js` | declarative event types | 41 / 50 |
| `snapshot.js` | ring buffer for time travel | 37 / 40 |
| `demo-gen.js` | deterministic event generator | 29 / 30 |

Run `npm run lines` to print live usage.

---

## Performance

Measured on a Windows laptop (Node 24, no special tuning):

| Scale | Wall time | Throughput | First UI update |
|---|---|---|---|
| 100k events | 121 ms | 829k events/sec | < 100 ms |
| 500k events (live SSE) | 1016 ms | 492k events/sec | 0 ms |
| 1M events | 1294 ms | 773k events/sec | 0 ms |
| Time-travel query (1M-event run) | 0–12 ms | — | — |

Memory stays bounded — heap grows roughly with the number of distinct entities,
not file size. A 1 GB JSONL file uses well under 100 MB of RAM.

---

## Verification

```bash
node tests/test-phase1.mjs   # walking skeleton (74 assertions)
node tests/test-phase2.mjs   # server + SSE + dashboard markup (48)
node tests/test-phase3.mjs   # declarative rules + fault tolerance (59)
node tests/test-phase4.mjs   # snapshots + time travel + HTTP (53)
node tests/test-phase5.mjs   # polish (scenarios, exports, README)
```

All suites are pure Node — no test runner installed, no dependencies. Each
file is executable on its own with a colorised pass/fail report.

---

## Constraint compliance

| Constraint | Result |
|---|---|
| Domain: data processing | parser + validator + transformer + pipeline + snapshots |
| Language: JavaScript, async-first | async generators, async iteration, EventSource |
| Response: < 2 seconds | first SSE event arrives in milliseconds; 1M events folded in 1.3 s |
| Source: ≤ 500 lines | 462 / 500 (verified by `npm run lines` on every commit) |
| Dependencies | zero |

---

## Project documents

- 📘 [Project spec](../CHRONOFOLD.md)
- 🛠 [Implementation plan](../IMPLEMENTATION_PLAN.md)

## License

MIT.
