#!/usr/bin/env node
// Removes chosen words from the derived list and re-scores, including on
// truncated documents.
//
// The question this answers: is there a hand-written ignore list worth having?
// Removing a word can only help if the word fires on human documents about as
// often as on machine ones, so it adds to both scores and separates neither.
//
// Documents are truncated to test the claim that filtering would help on short
// text. It would, if the removed words were noise: a short document has few
// words to find, so each spurious one moves the rate more.
//
//   node tools/word-ablate.mjs
//   node tools/word-ablate.mjs --budget 0

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { loadCorpus } from '../js/corpus.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };
const BUDGET = Number(arg('--budget', 1));

const set = JSON.parse(readFileSync(join(ROOT, 'rules/pr-vocabulary.json'), 'utf8'));
const ALL = set.rules[0].match.pattern.replace(/^\\b\(\?:/, '').replace(/\)\\b$/, '')
  .split('|').map((w) => w.replace(/\\/g, ''));

const POWER = set.rules[0].notable.power ?? 0.5;

const { human, ai } = loadCorpus();
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const bag = (d) => new Set((d.text.toLowerCase().match(/[a-z][a-z'’-]*/g) || []));
const H = human.map(bag), A = ai.map(bag);
const df = (sets, w) => sets.reduce((n, s) => n + (s.has(w) ? 1 : 0), 0);
const lift = (w) => (df(A, w) + 1) / (df(H, w) + 1);

// Cut each document to its first n words, so a list can be judged on the short
// text the rule currently refuses to score at all.
function truncate(d, n) {
  if (!n) return d;
  const parts = d.text.split(/(\s+)/);
  let count = 0, out = '';
  for (const p of parts) {
    if (/\S/.test(p)) { if (count >= n) break; count++; }
    out += p;
  }
  return { ...d, text: out, words: count };
}

function score(words, n) {
  const re = new RegExp(`\\b(?:${words.map(esc).join('|')})\\b`, 'gi');
  const of = (d) => new Set((d.text.match(re) || []).map((w) => w.toLowerCase())).size / Math.pow(d.words, POWER);
  const h = human.map((d) => of(truncate(d, n))).sort((a, b) => b - a);
  const a = ai.map((d) => of(truncate(d, n)));
  const t = h[BUDGET] + 1e-9;
  return { caught: a.filter((x) => x >= t).length, t };
}

const NUMBERS = ['halves', 'twelve', 'half', 'eleven', 'fourth', 'ten', 'fifth', 'nine', 'sides'];
const LEANS_HUMAN = ALL.filter((w) => df(A, w) + df(H, w) > 0 && lift(w) < 0.83);
const FLAT = ALL.filter((w) => df(A, w) + df(H, w) > 0 && lift(w) >= 0.83 && lift(w) <= 1.2);
const UNSEEN = ALL.filter((w) => df(A, w) + df(H, w) === 0);

const variants = [
  ['shipped, all 250', []],
  ['minus the counting words', NUMBERS],
  ['minus words leaning human', LEANS_HUMAN],
  ['minus leaning human + flat', [...LEANS_HUMAN, ...FLAT]],
  ['minus words unseen here *', UNSEEN],
  ['minus all three groups  *', [...LEANS_HUMAN, ...FLAT, ...UNSEEN]],
];

const SIZES = [0, 900, 600, 400, 300, 200];
console.log(`budget ${BUDGET} false alarm(s); ${ai.length} machine documents to catch`);
console.log('* chosen by looking at this same corpus, so these two cannot be judged on it\n');
console.log('variant'.padEnd(28) + 'words  ' + SIZES.map((n) => (n ? `${n}w` : 'full').padStart(6)).join(''));
for (const [label, drop] of variants) {
  const keep = ALL.filter((w) => !drop.includes(w));
  const cells = SIZES.map((n) => `${score(keep, n).caught}/24`.padStart(6)).join('');
  console.log(label.padEnd(28) + String(keep.length).padStart(5) + '  ' + cells);
}

console.log(`\ngroups: ${LEANS_HUMAN.length} lean human, ${FLAT.length} flat, ${UNSEEN.length} unseen`);
console.log(`lean human: ${LEANS_HUMAN.join(' ')}`);
console.log(`flat:       ${FLAT.join(' ')}`);

// ---- held out ------------------------------------------------------------
// Everything above except the counting words was chosen by measuring lift on
// the same 48 documents it is then scored on, so its gains are not evidence of
// anything. This is the honest version: pick the ignore list on three quarters
// of the pairs, score on the quarter that was held out, rotate.
console.log('\n--- an ignore list chosen without seeing what it is scored on ---');
const pairs = human.map((h, i) => ({ h, a: ai[i], i }));
const FOLDS = 4;
const tally = { shipped: 0, filtered: 0, n: 0, dropped: [] };
for (let f = 0; f < FOLDS; f++) {
  const test = pairs.filter((p) => p.i % FOLDS === f);
  const train = pairs.filter((p) => p.i % FOLDS !== f);
  const tH = train.map((p) => bag(p.h)), tA = train.map((p) => bag(p.a));
  const dfIn = (sets, w) => sets.reduce((n, s) => n + (s.has(w) ? 1 : 0), 0);
  // Drop what leans human on the training pairs only.
  const drop = ALL.filter((w) => {
    const a = dfIn(tA, w), h = dfIn(tH, w);
    return a + h > 0 && (a + 1) / (h + 1) < 0.83;
  });
  const keep = ALL.filter((w) => !drop.includes(w));
  const on = (words) => {
    const re = new RegExp(`\\b(?:${words.map(esc).join('|')})\\b`, 'gi');
    const of = (d) => new Set((d.text.match(re) || []).map((w) => w.toLowerCase())).size / Math.pow(d.words, POWER);
    const h = test.map((p) => of(p.h)).sort((x, y) => y - x);
    const t = h[BUDGET] !== undefined ? h[BUDGET] + 1e-9 : h[h.length - 1] + 1e-9;
    return test.map((p) => of(p.a)).filter((x) => x >= t).length;
  };
  const s = on(ALL), k = on(keep);
  tally.shipped += s; tally.filtered += k; tally.n += test.length;
  tally.dropped.push(drop.length);
  console.log(`  fold ${f + 1}: dropped ${String(drop.length).padStart(2)} words   `
    + `shipped ${s}/${test.length}   filtered ${k}/${test.length}`);
}
console.log(`  total:  shipped ${tally.shipped}/${tally.n}   filtered ${tally.filtered}/${tally.n}`
  + `   (dropped ${tally.dropped.join(', ')} words per fold)`);

// ---- what the corpus cannot see ------------------------------------------
// 114 words never appear in any of these 48 documents, so nothing above judged
// them. They are pull-request vocabulary, and the risk they carry is firing on
// human-written engineering prose -- which is 3 of the 24 pairs.
console.log('\n--- list words in the HUMAN technical documents ---');
const tech = human.filter((d) => d.register === 'techdoc');
for (const d of tech) {
  const hits = ALL.filter((w) => bag(d).has(w));
  console.log(`  ${d.id.padEnd(26)} ${String(hits.length).padStart(2)} of 250: ${hits.join(' ')}`);
}
