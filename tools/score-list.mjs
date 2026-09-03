#!/usr/bin/env node
// Scores a word list against the back-testing corpus the way the rule scores a
// document: how many DIFFERENT list words it uses, over the square root of its
// length.
//
// A per-1000-words rate is the wrong number to judge a list by. What decides
// whether a rule ships is how many machine-written documents it catches at a
// false-alarm rate somebody would actually accept, so that is what this
// reports: the threshold is set at the lowest value that keeps human documents
// at or under the budget, and then the machine documents are counted.
//
//   node tools/score-list.mjs                          every list, at 1 false alarm
//   node tools/score-list.mjs --budget 2               allow two
//   node tools/score-list.mjs --sizes 200,400,1000     truncate each list first

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { loadCorpus } from '../js/corpus.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };
const BUDGET = Number(arg('--budget', 1));
const SIZES = String(arg('--sizes', '200,400,700,1000,1200')).split(',').map(Number);
const { human, ai } = loadCorpus();
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A flat alternation back into the words it was built from.
function wordsOf(pattern) {
  const m = /^\\b\(\?:(.*)\)\\b$/s.exec(pattern);
  if (!m) return null;
  const parts = m[1].split('|');
  // A list word may hold punctuation (--noemit, round-trip, an em dash), but
  // anything with regex structure in it means this is not a plain word list.
  const plain = (p) => p.length > 0 && !/[[\]()|*+?{}^$]/.test(p.replace(/\\./g, ''));
  return parts.every(plain) ? parts.map((p) => p.replace(/\\(.)/g, '$1')) : null;
}

// The exponent comes from the rule being scored, not from a copy kept here: two
// list rules ship and they need not agree on it.
function score(label, words, POWER = 0.5) {
  const rows = [];
  for (const n of SIZES) {
    if (n > words.length) continue;
    const re = new RegExp(`\\b(?:${words.slice(0, n).map(esc).join('|')})\\b`, 'gi');
    const of = (d) => new Set((d.text.match(re) || []).map((w) => w.toLowerCase())).size / Math.pow(d.words, POWER);
    const h = human.map(of).sort((a, b) => b - a);
    const a = ai.map(of);
    // The lowest threshold that keeps false alarms inside the budget, which is
    // just above the (budget+1)-th highest human score.
    const t = h[BUDGET] + 1e-9;
    rows.push({ n, t, human: h.filter((x) => x >= t).length, ai: a.filter((x) => x >= t).length });
  }
  const best = rows.reduce((b, r) => (!b || r.ai > b.ai ? r : b), null);
  if (!best) { console.log(`${label.padEnd(26)} too short to score`); return null; }
  console.log(`${label.padEnd(26)} top ${String(best.n).padStart(4)} at ${best.t.toFixed(2)}  ->  `
    + `human ${String(best.human).padStart(2)}/${human.length}   ai ${String(best.ai).padStart(2)}/${ai.length}`);
  return best;
}

console.log(`corpus: ${human.length} human, ${ai.length} machine documents; budget ${BUDGET} false alarm(s)\n`);
// Explicit paths score just those files, which is how a sweep over a parameter
// gets compared without its candidates living in rules/.
const named = process.argv.slice(2).filter((a) => a.endsWith('.json'));
const targets = named.length
  ? named
  : ['rules', 'candidates'].flatMap((dir) => readdirSync(join(ROOT, dir))
      .filter((f) => f.endsWith('.json') && f !== 'index.json')
      .map((f) => join(ROOT, dir, f)));
{
  for (const path of targets) {
    const set = JSON.parse(readFileSync(path, 'utf8'));
    for (const r of set.rules || []) {
      const w = r.match?.pattern && r.match.distinct ? wordsOf(r.match.pattern) : null;
      if (w && w.length >= 100) score(`${set.name}/${r.id}`, w, r.notable?.power ?? 0.5);
    }
  }
}
