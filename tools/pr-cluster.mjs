#!/usr/bin/env node
// Derives the machine-writing vocabulary from public pull request descriptions.
//
// The method is a reproduction of louisabraham/load-bearing. This file fits one
// k and reports what both selectors would publish; tools/pr-fit.mjs is what CI
// runs, and it sweeps k and publishes only where the two agree.
//
//   THEIR selector: the largest of recent weeks among clusters that rose from
//   under 2% of all pull requests to over 20%.
//   OURS: the largest share of descriptions carrying a tool's signature.
//
// Each is wrong on its own, for unrelated reasons. Over four early fits theirs
// admitted two candidates every time and picked wrong in three. Ours ran for
// months and then, on 2026-09-07, published a front-end styling cluster at 39.0%
// signed over the register's 34.7%, because front-end work is heavily
// agent-assisted: signature-rich without being a way of writing. Because they
// fail for different reasons, a fit where they agree is one where neither excuse
// applies -- which is the rule pr-fit applies.
//
// Theirs, and not to be quietly changed: cluster the WHOLE archive at once, and
// score a word by its rate inside the published cluster over its rate in every
// other description. Fitting a recent window instead costs six of the
// twenty-four documents in data/corpus. See research/method.md for what else was
// tried and what each mistake cost.
//
//   node tools/pr-cluster.mjs                 report on one fit at the default k
//   node tools/pr-cluster.mjs --write         and rebuild the rule from it
//   node tools/pr-fit.mjs --write             what CI runs: sweep k, require
//                                             both selectors to agree
//
// Reads data/docs, written by tools/pr-sample.mjs. No prose is involved at any
// point: the sampler kept bags of words and threw the text away.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { availableDays, readDay } from '../js/pr-docs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = process.env.SLOP_DOCS_DIR || join(ROOT, 'data/docs');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };

const K = Number(arg('--k', 10));
const MIN_DF = Number(arg('--min-df', 50));  // documents a word needs before it enters the vocabulary
const MIN_WORDS = 5;                         // a description with fewer known words is not writing
const SMOOTH = 0.01;                         // added to every count in a centre
const MIN_AUTHORS = 50;                      // half of it is the prior on a word's outside count
const ITERS = Number(arg('--iters', 25));
// The length that ships, and therefore the default. It was a flag the workflow
// had to remember to pass, so CI derived a 1,200-word list while the rule's
// threshold was calibrated for 250, and the rule failed its own fixtures the
// first time the job ran. A default nobody has to remember cannot drift.
const TOP = Number(arg('--top', 250));
const SEED = Number(arg('--seed', 12345));
const TRACK = 400;                           // words per cluster given a weekly history for the page

// Slicing the archive by date is how the contrast this method rests on gets
// tested. The word ranking compares the machine-writing cluster against the
// REST of the corpus, so it needs a rest that is mostly human. That was true
// in early 2025 and is not true now, and a slice is the only way to measure
// what that costs.
const FROM = arg('--from', ''), TO = arg('--to', '');
const days = availableDays(DOCS).filter((d) => (!FROM || d >= FROM) && (!TO || d <= TO));
if (!days.length) {
  console.error(`no sampled days in ${FROM || 'start'}..${TO || 'end'} under ${DOCS}`
    + '; run tools/pr-sample.mjs first');
  process.exit(1);
}

// ---- pass one: how many documents each word appears in -------------------
const df = new Map();
for (const day of days) {
  const d = readDay(DOCS, day);
  for (const doc of d.docs) {
    let cur = 0;
    for (let i = 3; i < doc.length; i += 2) { cur += doc[i]; const w = d.vocab[cur]; df.set(w, (df.get(w) || 0) + 1); }
  }
}
const vocab = [...df].filter(([, n]) => n >= MIN_DF).map(([w]) => w).sort();
const at = new Map(vocab.map((w, i) => [w, i]));
const V = vocab.length;

// ---- pass two: every description as a slice of two flat arrays -----------
// Typed arrays, because a quarter of a million documents as objects is several
// gigabytes and this has to run on a CI box.
let slots = 0, N = 0;
for (const day of days) {
  const d = readDay(DOCS, day);
  for (const doc of d.docs) {
    let cur = 0, n = 0;
    for (let i = 3; i < doc.length; i += 2) { cur += doc[i]; if (at.has(d.vocab[cur])) n++; }
    if (n < MIN_WORDS) continue;
    slots += n; N++;
  }
}
const idx = new Int32Array(slots), val = new Int32Array(slots), off = new Int32Array(N + 1);
const sig = new Uint8Array(N);
const wkOf = new Int32Array(N);
const weeks = [];
const wkIndex = new Map();
{
  let p = 0, w = 0;
  for (const day of days) {
    const d = readDay(DOCS, day);
    const dt = new Date(day + 'T00:00:00Z');
    dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
    const wk = dt.toISOString().slice(0, 10);
    if (!wkIndex.has(wk)) { wkIndex.set(wk, weeks.length); weeks.push(wk); }
    const wid = wkIndex.get(wk);
    for (const doc of d.docs) {
      const start = p;
      let cur = 0;
      for (let i = 3; i < doc.length; i += 2) {
        cur += doc[i];
        const j = at.get(d.vocab[cur]);
        if (j !== undefined) { idx[p] = j; val[p] = doc[i + 1]; p++; }
      }
      if (p - start < MIN_WORDS) { p = start; continue; }
      off[w + 1] = p; sig[w] = doc[0]; wkOf[w] = wid; w++;
    }
  }
}
console.log(`${N.toLocaleString()} descriptions over ${days.length} days, ` +
  `${V.toLocaleString()} words, ${sig.reduce((a, b) => a + b, 0).toLocaleString()} signed\n`);

// ---- cluster -------------------------------------------------------------
function centre(members) {
  const acc = new Float64Array(V).fill(SMOOTH);
  let tot = SMOOTH * V;
  for (const i of members) for (let k = off[i]; k < off[i + 1]; k++) { acc[idx[k]] += val[k]; tot += val[k]; }
  const lw = new Float64Array(V);
  for (let v = 0; v < V; v++) lw[v] = Math.log(acc[v] / tot);
  return lw;
}
let seed = SEED;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const slices = Array.from({ length: K }, () => []);
for (let i = 0; i < N; i++) slices[Math.floor(rnd() * K)].push(i);
let centres = slices.map((s) => centre(s.length ? s : [0]));
const assign = new Int32Array(N).fill(-1);
let iters = 0, settled = false;
for (let it = 0; it < ITERS; it++) {
  iters = it + 1;
  let moved = 0;
  for (let i = 0; i < N; i++) {
    let best = -Infinity, bc = 0;
    for (let c = 0; c < K; c++) {
      const lw = centres[c];
      let s = 0;
      for (let k = off[i]; k < off[i + 1]; k++) s += val[k] * lw[idx[k]];
      if (s > best) { best = s; bc = c; }
    }
    if (assign[i] !== bc) { assign[i] = bc; moved++; }
  }
  const g = Array.from({ length: K }, () => []);
  for (let i = 0; i < N; i++) g[assign[i]].push(i);
  centres = g.map((m, c) => (m.length ? centre(m) : centres[c]));
  process.stderr.write(`  iteration ${it + 1}: ${moved} moved      \r`);
  if (!moved) { settled = true; break; }
}
process.stderr.write('\n');

// ---- what each cluster is, and which one to publish ----------------------
const app = Array.from({ length: K }, () => new Float64Array(V));
const corpus = new Float64Array(V);
const size = new Int32Array(K), signed = new Int32Array(K);
const perWeek = Array.from({ length: K }, () => new Int32Array(weeks.length));
const perWeekSigned = Array.from({ length: K }, () => new Int32Array(weeks.length));
const weekTotal = new Int32Array(weeks.length), weekWords = new Float64Array(weeks.length);
const weekWordsSigned = new Float64Array(weeks.length);
for (let i = 0; i < N; i++) {
  const c = assign[i], a = app[c];
  size[c]++; if (sig[i]) signed[c]++;
  perWeek[c][wkOf[i]]++; if (sig[i]) perWeekSigned[c][wkOf[i]]++;
  weekTotal[wkOf[i]]++;
  for (let k = off[i]; k < off[i + 1]; k++) {
    a[idx[k]] += val[k]; corpus[idx[k]] += val[k];
    weekWords[wkOf[i]] += val[k];
    if (sig[i]) weekWordsSigned[wkOf[i]] += val[k];
  }
}
const corpusTotal = corpus.reduce((s, x) => s + x, 0);
function scoreOf(c) {
  const inside = app[c];
  const here = Math.max(inside.reduce((s, x) => s + x, 0), 1);
  const elsewhere = Math.max(corpusTotal - here, 1);
  const lift = new Float64Array(V);
  for (let j = 0; j < V; j++)
    lift[j] = (inside[j] / here) / ((corpus[j] - inside[j] + MIN_AUTHORS / 2) / elsewhere);
  return lift;
}
const rankOf = (lift) => Array.from({ length: V }, (_, j) => j)
  .sort((a, b) => lift[b] - lift[a] || (vocab[a] < vocab[b] ? -1 : 1));

const share = (c) => size[c] / N;
const stamped = (c) => (size[c] ? signed[c] / size[c] : 0);
const window4 = (c, from, to) => {
  let n = 0, t = 0;
  for (let w = from; w < to; w++) { n += perWeek[c][w]; t += weekTotal[w]; }
  return t ? n / t : 0;
};
const start = (c) => window4(c, 0, Math.min(4, weeks.length));
const end = (c) => window4(c, Math.max(0, weeks.length - 4), weeks.length);

const clusters = Array.from({ length: K }, (_, c) => ({
  c, size: size[c], signed: signed[c], share: share(c), stamped: stamped(c),
  start: start(c), end: end(c), arrived: start(c) < 0.02 && end(c) >= 0.20,
  words: rankOf(scoreOf(c)),
}));
// The cluster with the largest share of signed descriptions. That alone chose
// wrong on 2026-09-07 -- a front-end styling cluster at 39.0% against the
// register's 34.7% -- so it is no longer the whole rule: tools/pr-fit.mjs sweeps
// k and publishes only from a fit where this and the growth test agree. This
// stays the plain measure so that what pr-fit judges is what pr-cluster then
// writes.
const publish = clusters.reduce((b, x) => (!b || x.stamped > b.stamped ? x : b));

// The published cluster first, then the rest by signed share. While the share
// alone chooses these are the same list, and this is written the long way round
// so that stays true if the selection ever stops agreeing with the ranking: a
// version that asserted position 0 was also the highest-signed threw instead of
// publishing the moment the two came apart.
const rest = clusters.filter((x) => x !== publish).sort((a, b) => b.stamped - a.stamped);
const stackOrder = [publish, ...rest];
stackOrder.forEach((x, i) => { x.stack = i; });

console.log(`  c    size    start      end   arrived   stamped   most characteristic words`);
for (const x of stackOrder) {
  console.log(`  ${x === publish ? '->' : '  '}${String(x.stack).padStart(2)} ` +
    `${(100 * x.share).toFixed(1).padStart(5)}% ${(100 * x.start).toFixed(1).padStart(7)}% ` +
    `${(100 * x.end).toFixed(1).padStart(8)}%   ${x.arrived ? ' YES ' : '  -  '}   ` +
    `${(100 * x.stamped).toFixed(1).padStart(6)}%   ${x.words.slice(0, 6).map((j) => vocab[j]).join(' ')}`);
}
// Their test, reported alongside as a cross-check. When the two disagree, that
// is worth knowing rather than hiding: it means the growth signal has gone
// ambiguous, which is exactly the failure this method was changed to avoid.
const grew = clusters.filter((x) => x.arrived);
console.log(`\npublished cluster ${publish.stack} (k-means label ${publish.c}), ${(100 * publish.stamped).toFixed(1)}% signed` +
  ` (runner-up ${(100 * [...clusters].sort((a, b) => b.stamped - a.stamped)[1].stamped).toFixed(1)}%)`);
// Upstream publishes the largest of recent weeks among those that arrived. Worth
// printing beside ours: on 2026-09-07 the two disagreed and theirs was right.
const theirs = grew.reduce((b, x) => (!b || x.end > b.end ? x : b), null);
if (theirs) {
  console.log(`  their rule would publish cluster ${theirs.stack} `
    + `(${(100 * theirs.end).toFixed(1)}% of recent weeks, ${(100 * theirs.stamped).toFixed(1)}% signed)`
    + `${theirs === publish ? ' — the same one' : ' — NOT the one chosen here'}`);
}
console.log(`their growth test would admit ${grew.length ? grew.map((x) => x.c).join(', ') : 'no cluster'}` +
  `${grew.length === 1 && grew[0].c === publish.c ? ' — the same one' : grew.length ? '' : ''}`);
if (!settled) console.log(`NOTE: the fit did not settle in ${ITERS} iterations`);

const lift = scoreOf(publish.c);
const keep = publish.words.slice(0, TOP);
console.log(`\nthe published list, ${keep.length} words:`);
console.log('  ' + keep.slice(0, 30).map((j) => vocab[j]).join(' '));

// ---- weekly history, for the page ---------------------------------------
// clusters[].words holds vocabulary indices; the history is keyed by the word
// itself, so this has to translate. Not doing so left every word without a
// history and the page saying so on all 250 of them.
const tracked = [...new Set(clusters.flatMap((x) => x.words.slice(0, TRACK).map((j) => vocab[j])))].sort();
const tIdx = new Map(tracked.map((w, i) => [w, i]));
const counts = Array.from({ length: weeks.length }, () => new Int32Array(tracked.length));
const countsSigned = Array.from({ length: weeks.length }, () => new Int32Array(tracked.length));
for (let i = 0; i < N; i++) {
  const w = wkOf[i];
  for (let k = off[i]; k < off[i + 1]; k++) {
    const t = tIdx.get(vocab[idx[k]]);
    if (t === undefined) continue;
    counts[w][t] += val[k];
    if (sig[i]) countsSigned[w][t] += val[k];
  }
}

const DUMP = arg('--dump', '');
if (DUMP) {
  writeFileSync(DUMP, JSON.stringify({
    days: days.length, from: days[0], to: days[days.length - 1], descriptions: N, k: K,
    clusters: stackOrder.map((x) => ({
      stack: x.stack, label: x.c, size: x.size, share: x.share, stamped: x.stamped,
      start: x.start, end: x.end, arrived: x.arrived,
      words: x.words.slice(0, TOP).map((j) => vocab[j]),
    })),
  }) + '\n');
  console.log(`wrote ${DUMP}`);
}
const built = new Date().toISOString().slice(0, 10);
// --dry fits and reports without touching data/ or rules/, so a sweep over k
// cannot leave the page reading a fit nobody chose.
const DRY = process.argv.includes('--dry');
const OUT = arg('--out', '');
if (DRY && OUT) {
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  writeFileSync(OUT, JSON.stringify({ name: `k${K}`, version: '0.0.0', slop: '0.1.0',
    title: `k=${K}`, rules: [{ id: `k${K}`, name: `k${K}`,
      match: { kind: 'regex', pattern: `\\b(?:${keep.map((j) => esc(vocab[j])).join('|')})\\b`, flags: 'gi', distinct: true },
      notable: { '>=': 0.40, per: 'root', unit: 'words',
                 needs: { words: 600, sentences: 5, matches: 10 } },
      description: 'sweep', suggest: 'sweep',
      tests: { hit: [], miss: [] } }] }, null, 2) + '\n');
  console.log(`wrote ${OUT}`);
}
if (!DRY) writeFileSync(join(ROOT, 'data/cluster.json'), JSON.stringify({
  built, days, k: K, iterations: iters, settled,
  descriptions: N, signed: sig.reduce((a, b) => a + b, 0), vocabulary: V,
  constants: { MIN_DF, MIN_WORDS, SMOOTH, MIN_AUTHORS, TOP, SEED },
  publish: { id: publish.stack, fit: publish.c, size: publish.size, signed: publish.signed,
             stamped: +publish.stamped.toFixed(4), start: +publish.start.toFixed(4),
             end: +publish.end.toFixed(4), arrived: publish.arrived,
             growthAdmits: grew.map((x) => x.stack) },
  clusters: stackOrder.map((x) => ({
    id: x.stack, fit: x.c, size: x.size, signed: x.signed, share: +x.share.toFixed(4),
    stamped: +x.stamped.toFixed(4), start: +x.start.toFixed(4), end: +x.end.toFixed(4),
    published: x === publish,
    about: x.words.slice(0, 10).map((j) => vocab[j]),
    words: x.words.slice(0, x.c === publish.c ? TOP : TRACK)
      .map((j, i) => ({ w: vocab[j], rank: i + 1, lift: +scoreOf(x.c)[j].toFixed(3) })),
  })),
  words: keep.map((j, i) => ({ w: vocab[j], rank: i + 1, lift: +lift[j].toFixed(3) })),
}, null, 1) + '\n');
if (!DRY) console.log('\nwrote data/cluster.json');

if (!DRY) writeFileSync(join(ROOT, 'data/cluster-series.json'), JSON.stringify({
  built, from: weeks[0], to: weeks[weeks.length - 1],
  clusters: stackOrder.map((x) => x.stack), words: tracked,
  schema: 'weeks[].counts[i] is appearances of words[i] that week; countsSigned[i] the same over '
        + 'signed descriptions only. Rate per million = counts[i] / words * 1e6.',
  weeks: weeks.map((w, i) => ({
    w, docs: weekTotal[i], words: weekWords[i], wordsSigned: weekWordsSigned[i],
    signed: clusters.reduce((a, x) => a + perWeekSigned[x.c][i], 0),
    byGroup: stackOrder.map((x) => perWeek[x.c][i]),
    byGroupSigned: stackOrder.map((x) => perWeekSigned[x.c][i]),
    counts: Array.from(counts[i]), countsSigned: Array.from(countsSigned[i]),
  })),
}) + '\n');
if (!DRY) console.log('wrote data/cluster-series.json');

if (!DRY) {
  const path = join(ROOT, 'data/cluster-history.json');
  let hist = [];
  try { hist = JSON.parse(readFileSync(path, 'utf8')); } catch { /* first build */ }
  hist = hist.filter((h) => h.built !== built);
  hist.push({ built, from: days[0], to: days[days.length - 1], descriptions: N,
              published: { id: publish.stack, stamped: +publish.stamped.toFixed(4) },
              words: Object.fromEntries(keep.slice(0, 300).map((j, i) => [vocab[j], i + 1])) });
  hist.sort((a, b) => a.built.localeCompare(b.built));
  writeFileSync(path, JSON.stringify(hist, null, 1) + '\n');
  console.log(`wrote data/cluster-history.json  (${hist.length} builds)`);
}

if (process.argv.includes('--write') && !DRY) {
  const path = join(ROOT, 'rules/pr-vocabulary.json');
  const set = JSON.parse(readFileSync(path, 'utf8'));
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const [maj, min, patch] = (set.version || '0.1.0').split('.').map(Number);
  set.version = `${maj}.${min}.${patch + 1}`;
  set.corpus = { built, days: days.length, from: days[0], to: days[days.length - 1],
                 descriptions: N, cluster: publish.c,
                 stamped: `${(100 * publish.stamped).toFixed(1)}%`, words: keep.length };
  set.rules[0].match.pattern = `\\b(?:${keep.map((j) => esc(vocab[j])).join('|')})\\b`;
  writeFileSync(path, JSON.stringify(set, null, 2) + '\n');
  console.log(`wrote rules/pr-vocabulary.json v${set.version}`);
}
