#!/usr/bin/env node
// Scores every word in a derived list against the back-testing corpus, one
// word at a time.
//
// The list is derived from GitHub pull request descriptions. The corpus in
// data/corpus is 24 matched pairs of general prose, human and machine, on the
// same topics. The derivation has never seen it. So a word's behaviour here is
// an out-of-sample check on whether it is a tell at all, as opposed to a word
// the machine-writing cluster happens to use because of what that cluster is
// about.
//
// The rule counts DISTINCT list words per document, so what decides a word's
// contribution is how many documents it turns up in, not how often. That is
// what this measures: document frequency on each side.
//
//   node tools/word-audit.mjs                          the shipped list
//   node tools/word-audit.mjs rules/load-bearing.json  any set with one list

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { loadCorpus } from '../js/corpus.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv.find((a) => a.endsWith('.json')) || 'rules/pr-vocabulary.json';

const set = JSON.parse(readFileSync(join(ROOT, file), 'utf8'));
const rule = set.rules.find((r) => r.match?.distinct);
const words = rule.match.pattern.replace(/^\\b\(\?:/, '').replace(/\)\\b$/, '').split('|')
  .map((w) => w.replace(/\\/g, ''));

const { human, ai } = loadCorpus({});
const bag = (d) => new Set((d.text.toLowerCase().match(/[a-z][a-z'’-]*/g) || []));
const H = human.map(bag), A = ai.map(bag);
const df = (sets, w) => sets.reduce((n, s) => n + (s.has(w) ? 1 : 0), 0);

const rows = words.map((w, i) => {
  const h = df(H, w), a = df(A, w);
  // Add-one on both sides so a word in 0 human documents is not infinite.
  return { w, rank: i + 1, h, a, lift: (a + 1) / (h + 1) };
});

const fmt = (r) => `${String(r.rank).padStart(4)}  ${r.w.padEnd(20)} ai ${String(r.a).padStart(2)}/24`
  + `   human ${String(r.h).padStart(2)}/24   lift ${r.lift.toFixed(2)}`;

console.log(`${file}: ${words.length} words against ${A.length} machine and ${H.length} human documents`);
console.log('lift = (machine df + 1) / (human df + 1). Above 1 the word leans machine.\n');

const seen = rows.filter((r) => r.a + r.h > 0);
const unseen = rows.filter((r) => r.a + r.h === 0);
console.log(`${unseen.length} of ${words.length} words appear in no corpus document at all.`);
console.log(`${seen.length} appear somewhere. Of those:`);
const helps = seen.filter((r) => r.lift > 1.2);
const flat = seen.filter((r) => r.lift >= 0.83 && r.lift <= 1.2);
const hurts = seen.filter((r) => r.lift < 0.83);
console.log(`  ${helps.length} lean machine (lift > 1.2)`);
console.log(`  ${flat.length} are flat        (0.83 - 1.2)`);
console.log(`  ${hurts.length} lean human   (lift < 0.83)\n`);

console.log('--- leans human, and common enough to matter (human df >= 4) ---');
for (const r of hurts.filter((x) => x.h >= 4).sort((a, b) => a.lift - b.lift)) console.log(fmt(r));

console.log('\n--- flat, and common on both sides (human df >= 6) ---');
for (const r of flat.filter((x) => x.h >= 6).sort((a, b) => b.h - a.h)) console.log(fmt(r));

console.log('\n--- the counting words, whatever they do ---');
const NUMBERS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'half', 'halves', 'twice', 'fourth', 'fifth', 'third', 'sides', 'both'];
for (const r of rows.filter((x) => NUMBERS.includes(x.w))) console.log(fmt(r));

console.log('\n--- strongest tells (top 15 by lift, seen in >= 3 machine documents) ---');
for (const r of seen.filter((x) => x.a >= 3).sort((a, b) => b.lift - a.lift).slice(0, 15)) console.log(fmt(r));
