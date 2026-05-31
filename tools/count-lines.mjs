#!/usr/bin/env node
// Build tool. Does NOT count toward the 500-line source budget.
// Prints per-file line usage and total against the hard cap.

import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const BUDGET = {
  'engine.js':       150,
  'dashboard.html':  150,
  'server.js':        80,
  'rules.js':         50,
  'snapshot.js':      40,
  'demo-gen.js':      30,
};
const TOTAL_CAP = Object.values(BUDGET).reduce((a, b) => a + b, 0);

// Count non-empty, non-comment-only lines.
// We count any line that has a non-whitespace character that isn't purely
// `//` or `/*` markers. Simple and intentionally generous so we are honest
// about complexity rather than gaming whitespace.
function countLines(source) {
  return source
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .length;
}

async function fileLines(rel) {
  const full = join(ROOT, rel);
  try {
    await stat(full);
  } catch {
    return null; // file not yet created (Phase 0 state)
  }
  const src = await readFile(full, 'utf8');
  return countLines(src);
}

const colors = {
  reset:  '\x1b[0m',
  dim:    '\x1b[2m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
};

function bar(used, cap, width = 24) {
  const ratio = cap === 0 ? 0 : Math.min(used / cap, 1);
  const filled = Math.round(ratio * width);
  const color = ratio < 0.7 ? colors.green : ratio < 1 ? colors.yellow : colors.red;
  return color + '█'.repeat(filled) + colors.dim + '░'.repeat(width - filled) + colors.reset;
}

function pad(s, n, right = false) {
  s = String(s);
  if (s.length >= n) return s;
  return right ? s + ' '.repeat(n - s.length) : ' '.repeat(n - s.length) + s;
}

console.log('');
console.log(colors.bold + colors.cyan + '  Chronofold — line budget' + colors.reset);
console.log('  ' + colors.dim + '─'.repeat(56) + colors.reset);

let total = 0;
let missing = 0;

for (const [file, cap] of Object.entries(BUDGET)) {
  const used = await fileLines(file);
  if (used === null) {
    missing++;
    console.log(
      '  ' + pad(file, 16, true) + colors.dim + bar(0, cap) + colors.reset +
      colors.dim + ' ' + pad('—', 5) + ' / ' + pad(cap, 3) + '   not yet created' + colors.reset,
    );
    continue;
  }
  total += used;
  const overBudget = used > cap;
  const useColor = overBudget ? colors.red : colors.reset;
  console.log(
    '  ' + pad(file, 16, true) + bar(used, cap) +
    ' ' + useColor + pad(used, 5) + ' / ' + pad(cap, 3) + colors.reset +
    (overBudget ? colors.red + '   OVER BUDGET' + colors.reset : ''),
  );
}

console.log('  ' + colors.dim + '─'.repeat(56) + colors.reset);
const totalOver = total > TOTAL_CAP;
const totalColor = totalOver ? colors.red : total > TOTAL_CAP * 0.9 ? colors.yellow : colors.green;
console.log(
  '  ' + colors.bold + pad('TOTAL', 16, true) + colors.reset +
  bar(total, TOTAL_CAP) +
  ' ' + totalColor + colors.bold + pad(total, 5) + ' / ' + pad(TOTAL_CAP, 3) + colors.reset +
  (totalOver ? colors.red + '   HARD CAP EXCEEDED' + colors.reset : ''),
);
console.log('');
if (missing > 0) {
  console.log(
    '  ' + colors.dim + missing + ' file(s) not yet created — expected during early phases.' +
    colors.reset,
  );
  console.log('');
}

process.exit(totalOver ? 1 : 0);
