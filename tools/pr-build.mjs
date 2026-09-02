#!/usr/bin/env node
// Builds the word list from the accumulated daily counts.
//
// For each word: how much more often does it appear in a description that
// signed itself machine-written than in one from the same days that did not?
//
//   lift = (markedDocs / totalMarked) / ((unmarkedDocs + 0.5) / totalUnmarked)
//
// The comparison is same-day throughout, which is what removes topic drift:
// mcp, ruff and typecheck appear on both sides of any given day and cancel. A
// word survives only by distinguishing who wrote it.
//
// Two floors, both stated here rather than inferred, because a number you can
// read and argue with beats a formula that hides one:
//
//   MIN_UNMARKED  a word must appear in this many control descriptions before
//                 its ratio means anything
//   MIN_AUTHORS   and be used by this many people, so one prolific account
//                 cannot invent a tell
//
//   node tools/pr-build.mjs                    report the list
//   node tools/pr-build.mjs --write            write it into the rule set
//   node tools/pr-build.mjs --top 1200 --min-unmarked 100

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { accumulate } from './lib/counts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };

// Chosen on a 24,000-document sample and due a re-read now the backfill is in:
// at that size 100 was a large share of the corpus and it cut the rare, strongly
// lifted words that make the best tells. See research/pr-vocabulary.md.
const MIN_UNMARKED = Number(arg('--min-unmarked', 100));
const MIN_AUTHORS = Number(arg('--min-authors', 15));
const TOP = Number(arg('--top', 1200));

const { words, totals } = accumulate(join(ROOT, 'data/counts'),
  { from: arg('--from', null), to: arg('--to', null) });
if (!totals.marked) { console.error('no marked descriptions in the counts; nothing to build'); process.exit(2); }

const rows = [];
for (const [w, [md, ud, ma]] of words) {
  if (ud < MIN_UNMARKED || ma < MIN_AUTHORS) continue;
  const lift = (md / totals.marked) / ((ud + 0.5) / totals.unmarked);
  if (lift <= 1) continue;
  rows.push({ w, lift: +lift.toFixed(3), marked: md, unmarked: ud, authors: ma });
}
rows.sort((a, b) => b.lift - a.lift);
const keep = rows.slice(0, TOP);

console.log(`${totals.days} days: ${totals.marked} marked, ${totals.unmarked} unmarked descriptions`);
console.log(`${words.size} words seen, ${rows.length} clear both floors, keeping ${keep.length}`);
console.log(`floors: unmarked >= ${MIN_UNMARKED}, authors >= ${MIN_AUTHORS}`);
console.log('\ntop 25:');
for (const r of keep.slice(0, 25))
  console.log(`  ${r.lift.toFixed(1).padStart(6)}x  ${String(r.marked).padStart(5)}/${String(r.unmarked).padStart(6)}  ${r.w}`);

if (process.argv.includes('--write')) {
  const path = join(ROOT, 'candidates/ai-vocabulary.json');
  const set = JSON.parse(readFileSync(path, 'utf8'));
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const [maj, min, patch] = (set.version || '0.1.0').split('.').map(Number);
  set.version = `${maj}.${min}.${patch + 1}`;
  set.corpus = { days: totals.days, marked: totals.marked, unmarked: totals.unmarked,
                 words: keep.length, built: new Date().toISOString().slice(0, 10),
                 floors: { unmarked: MIN_UNMARKED, authors: MIN_AUTHORS } };
  set.rules[0].match.pattern = `\\b(?:${keep.map((r) => esc(r.w)).join('|')})\\b`;
  writeFileSync(path, JSON.stringify(set, null, 2) + '\n');
  console.log(`\nwrote rules/ai-vocabulary.json v${set.version}`);
}
