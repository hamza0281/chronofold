# Chronofold

> **Fold a million events into one truth.**

A zero-dependency, fault-tolerant event-sourced state engine in vanilla JavaScript.
Built for [Code Olympics 2026](https://codeolympics.com/2026) under these constraints:

| Constraint | Status |
|---|---|
| Domain: Data Processing | ✅ Parser + validator + transformer + pipeline |
| Language: JavaScript (async-first) | ✅ Pure Node.js streams + async iteration |
| Response time: < 2 seconds | ✅ First counter visible within 100 ms |
| Line budget: 500 lines max | 🚧 see `npm run lines` |
| Dependencies | ✅ Zero |

## What is this?

Drop a JSONL stream of events — banking transactions, blockchain transfers,
inventory updates, game actions — and Chronofold streams them, validates them
against declarative rules, and folds them into a current state. Includes
time-travel snapshots, a live browser dashboard, and a generic rules engine.

## Quick start

```bash
node demo-gen.js 100000 > demo.jsonl    # generate test events
node server.js demo.jsonl                # open http://localhost:7777
```

## Project documents

- 📘 [Project spec](../CHRONOFOLD.md) — full concept, features, architecture
- 🛠 [Implementation plan](../IMPLEMENTATION_PLAN.md) — phased build plan with budgets

## Status

**Phase 0 — Setup.** Repository scaffolded. Source files are added in Phase 1.

## Line budget

Run `npm run lines` (or `node tools/count-lines.mjs`) to see live usage.

## License

MIT.
