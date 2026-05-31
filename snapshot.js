// snapshot.js — ring buffer of state snapshots for time-travel queries.
// Engine calls ring.observe(processedIndex, validEvent, state) for each valid event.
// At every `every`-th processedIndex a deep copy of state is captured.
// Each snapshot owns the trailing valid events that came after it.
// stateAt(target) returns a fresh Map of state as of input line `target`.
// snaps[0] (bootstrap) is pinned so the start of long runs stays queryable.

import { apply } from './rules.js';

export class SnapshotRing {
  constructor(every = 10_000, capacity = 100) {
    this.every = every;
    this.capacity = capacity;
    this.evicted = 0;
    this.snaps = [{ index: 0, state: new Map(), tail: [] }];
  }

  observe(index, event, state) {
    this.snaps[this.snaps.length - 1].tail.push({ line: index, event });
    if (index > 0 && index % this.every === 0) {
      this.snaps.push({ index, state: new Map(state), tail: [] });
      if (this.snaps.length > this.capacity) { this.snaps.splice(1, 1); this.evicted++; }
    }
  }

  stateAt(target) {
    target = Math.max(0, target | 0);
    let chosen = null;
    for (const s of this.snaps) { if (s.index <= target) chosen = s; else break; }
    if (!chosen) return new Map();
    // If eviction happened and bootstrap was selected for a target past `every`,
    // the original answer lived in a now-evicted snapshot. Return empty honestly.
    if (chosen === this.snaps[0] && this.evicted > 0 && target > this.every) return new Map();
    const state = new Map(chosen.state);
    for (const { line, event } of chosen.tail) if (line <= target) apply(event, state);
    return state;
  }

  size()   { return this.snaps.length; }
  oldest() { return this.snaps[0]?.index ?? 0; }
  newest() { return this.snaps[this.snaps.length - 1]?.index ?? 0; }
}
