#!/usr/bin/env node
// Two questions about the shipped operating point, both answered by holding
// something out rather than by reading the best number off the corpus.
//
// 1. The rule ships 250 words at a threshold of 0.40 and catches 20 of 24.
//    Tuning both to this corpus gives 200 at 0.31 and catches 22. Is that a
//    better rule, or 48 documents being fitted? Choosing on part of the corpus
//    and scoring on the rest tells them apart.
//
// 2. `per: "root"` divides a distinct count by the square root of the length.
//    The right exponent is whatever makes ONE threshold mean the same thing on
//    a short document and a long one. That is testable directly: calibrate the
//    threshold on full-length documents and apply it to truncated ones. An
//    exponent that is too low makes long documents score high and flags them;
//    too high and short documents do. The best one holds the false-alarm rate
//    flat across lengths.
//
//   node tools/metric-sweep.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { loadCorpus } from '../js/corpus.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const set = JSON.parse(readFileSync(join(ROOT, 'rules/pr-vocabulary.json'), 'utf8'));
const ALL = set.rules[0].match.pattern.replace(/^\\b\(\?:/, '').replace(/\)\\b$/, '')
  .split('|').map((w) => w.replace(/\\/g, ''));
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const { human, ai } = loadCorpus();

const reOf = (n) => new RegExp(`\\b(?:${ALL.slice(0, n).map(esc).join('|')})\\b`, 'gi');
const cut = (d, n) => {
  if (!n) return d;
  const parts = d.text.split(/(\s+)/);
  let c = 0, out = '';
  for (const p of parts) { if (/\S/.test(p)) { if (c >= n) break; c++; } out += p; }
  return { ...d, text: out, words: c };
};
const hits = (d, re) => new Set((d.text.match(re) || []).map((w) => w.toLowerCase())).size;
const metric = (d, re, beta) => hits(d, re) / Math.pow(d.words, beta);

// ---- 1. is 200 at 0.31 a better rule, or a fitted one? --------------------
// Two knobs are chosen here, list length and threshold, on 48 documents. The
// fold picks both on three quarters and is scored on the quarter held out.
console.log('=== choosing list length and threshold, held out ===\n');
const LENGTHS = [100, 150, 200, 250];
const FOLDS = 4;
const idx = human.map((_, i) => i);

function pick(trainIdx, budget) {
  // The best (length, threshold) on the training documents alone.
  let best = null;
  for (const n of LENGTHS) {
    const re = reOf(n);
    const h = trainIdx.map((i) => metric(human[i], re, 0.5)).sort((a, b) => b - a);
    const t = h[budget] + 1e-9;
    const caught = trainIdx.filter((i) => metric(ai[i], re, 0.5) >= t).length;
    if (!best || caught > best.caught) best = { n, t, caught };
  }
  return best;
}

let heldTuned = 0, heldShipped = 0, heldTotal = 0;
const picks = [];
for (let f = 0; f < FOLDS; f++) {
  const test = idx.filter((i) => i % FOLDS === f);
  const train = idx.filter((i) => i % FOLDS !== f);
  // One false alarm out of 18 training documents is the same rate as one out
  // of 24, near enough, and the budget has to scale with the fold.
  const p = pick(train, 1);
  picks.push(`${p.n}@${p.t.toFixed(2)}`);
  const reT = reOf(p.n), reS = reOf(250);
  heldTuned += test.filter((i) => metric(ai[i], reT, 0.5) >= p.t).length;
  heldShipped += test.filter((i) => metric(ai[i], reS, 0.5) >= 0.40).length;
  heldTotal += test.length;
}
console.log(`  each fold chose: ${picks.join('   ')}`);
console.log(`  tuned per fold, scored held out : ${heldTuned}/${heldTotal}`);
console.log(`  shipped 250 @ 0.40, same documents: ${heldShipped}/${heldTotal}`);

// How much room each operating point leaves above the human documents.
console.log('\n=== how close each threshold sits to human writing ===\n');
for (const [label, n, t] of [['shipped  250 @ 0.40', 250, 0.40], ['tuned    200 @ 0.31', 200, 0.31]]) {
  const re = reOf(n);
  const h = human.map((d) => metric(d, re, 0.5)).sort((a, b) => b - a);
  const a = ai.map((d) => metric(d, re, 0.5)).sort((x, y) => y - x);
  const mean = h.reduce((s, x) => s + x, 0) / h.length;
  const sd = Math.sqrt(h.reduce((s, x) => s + (x - mean) ** 2, 0) / h.length);
  console.log(`  ${label}   human ${h.filter((x) => x >= t).length}/24  machine ${a.filter((x) => x >= t).length}/24`);
  console.log(`     highest human ${h[0].toFixed(2)}, threshold ${t.toFixed(2)}, `
    + `gap ${((t - h[0]) / sd).toFixed(2)} human SD above the top human document`);
  console.log(`     machine documents below the threshold: ${a.filter((x) => x < t).map((x) => x.toFixed(2)).join(' ')}`);
}

// ---- 2. what exponent makes one threshold hold across lengths? ------------
console.log('\n=== one threshold, applied to shorter documents ===');
console.log('threshold calibrated on FULL-length human documents at 1 false alarm,');
console.log('then applied unchanged as documents are truncated.\n');
const SIZES = [900, 600, 400, 300];
const re = reOf(250);
console.log('  beta   thresh   ' + ['full', ...SIZES.map((n) => `${n}w`)].map((s) => s.padStart(11)).join(''));
for (const beta of [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]) {
  const hFull = human.map((d) => metric(d, re, beta)).sort((a, b) => b - a);
  const t = hFull[1] + 1e-9;
  const cells = [0, ...SIZES].map((n) => {
    const H = human.map((d) => metric(cut(d, n), re, beta)).filter((x) => x >= t).length;
    const A = ai.map((d) => metric(cut(d, n), re, beta)).filter((x) => x >= t).length;
    return `${H}fa ${String(A).padStart(2)}/24`.padStart(11);
  });
  console.log(`  ${beta.toFixed(1)}   ${t.toFixed(3).padStart(6)}   ${cells.join('')}`);
}
console.log('\n  fa = human documents falsely flagged at that length, out of 24.');
console.log('  A metric that travels keeps fa near 1 all the way across.');

// ---- is the exponent itself stable, or another fitted number? ------------
// Same discipline as everything else: choose beta on three quarters of the
// pairs, score on the quarter held out, at the length that matters.
console.log('\n=== choosing the exponent held out ===\n');
const BETAS = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
for (const at of [400, 600]) {
  let chosen = [], won = 0, base = 0, total = 0;
  for (let f = 0; f < FOLDS; f++) {
    const test = idx.filter((i) => i % FOLDS === f);
    const train = idx.filter((i) => i % FOLDS !== f);
    let best = null;
    for (const beta of BETAS) {
      // Threshold from full-length training humans, scored on truncated ones.
      const t = train.map((i) => metric(human[i], re, beta)).sort((a, b) => b - a)[1] + 1e-9;
      const fa = train.filter((i) => metric(cut(human[i], at), re, beta) >= t).length;
      const hit = train.filter((i) => metric(cut(ai[i], at), re, beta) >= t).length;
      // Refuse an exponent that loses false-alarm control on the training half.
      if (fa > 2) continue;
      if (!best || hit > best.hit) best = { beta, t, hit };
    }
    chosen.push(best.beta);
    won += test.filter((i) => metric(cut(ai[i], at), re, best.beta) >= best.t).length;
    const t5 = train.map((i) => metric(human[i], re, 0.5)).sort((a, b) => b - a)[1] + 1e-9;
    base += test.filter((i) => metric(cut(ai[i], at), re, 0.5) >= t5).length;
    total += test.length;
  }
  console.log(`  at ${at} words: folds chose beta ${chosen.join(', ')}`);
  console.log(`     chosen beta held out ${won}/${total}   square root held out ${base}/${total}`);
}
