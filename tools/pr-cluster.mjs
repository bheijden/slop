#!/usr/bin/env node
// Derives the machine-writing vocabulary from public pull request descriptions.
//
// Some descriptions sign themselves: a trailing "Generated with ..." line, or a
// shouted HTML comment. That signature is a free label. It says one thing, and
// only one thing, reliably: THIS DOCUMENT WAS WRITTEN BY A MACHINE. It does not
// say the unsigned ones were written by people (plenty are machine-written with
// the footer stripped), and it does not say a group with more signatures in it
// is more machine-sounding. Every use of it below is confined to the one claim
// it supports.
//
// THE PROBLEM. Scoring words by how much more often they appear on the signed
// side finds the WORK, not the writing. Agents get pointed at typecheck
// failures and lockfile bumps, so a plain ratio returns `pytest`, `--noemit`,
// `nbsp`. Measured: that list catches 9 of 24 machine-written documents in
// data/corpus. It also favours common words, because a ratio has no term for
// rarity — `here` and `note` outrank `amendment` and `cited`.
//
// THE METHOD. Three steps, each doing one job.
//
//   1. FIND THE REGISTER. Cluster into K_REGISTER groups by word use alone,
//      with the signatures hidden from the fit, and take the group with the
//      largest signed share. Coarse on purpose: at ten groups the register
//      splits in two and the wrong half wins the signed share; at five it is
//      one group and every way of choosing agrees on it. That agreement is
//      checked below, and a disagreement is reported rather than swallowed.
//
//   2. RANK BY CONTRAST WITH THE REST. A word's score is its rate inside that
//      group over its rate in every other description. The second term is what
//      penalises words everybody uses, and it is the whole reason this ranks
//      `amendment` over `here`.
//
//   3. DROP WHAT ONLY LIVES IN ONE CORNER. Cluster again, finely, into K_SMALL
//      small groups. The register does not become one of them: it spreads across
//      several, and one small group is nearly all register (measured at 95%), its
//      densest slice. Inside each small group, compare signed against unsigned. A
//      word that is common enough to be measured in exactly one small group only
//      ever appears densely inside one of those parts, and is dropped -- 175 of the
//      200 highest-ranked drops are from that one dense part, words like
//      `somebody`, `priced`, `morning`, `rectangle`. Words spread over several
//      parts are kept, and so is anything too rare to be measured anywhere,
//      because this test may remove evidence and never demand it.
//
// Two things are worth stating precisely about step 3, because the obvious
// readings of it are both wrong. It is NOT a rarity filter: the words it drops
// are RARER in ordinary human prose than the ones it keeps. And it is not
// merely reaching further down the ranking: at a list of 1200 it scores 21 of
// 24 against 20 for an unfiltered list of the same length and 20 for an
// unfiltered list of the same depth. What it removes is vocabulary specific to
// one part of the register rather than shared across it.
//
// Measured on data/corpus at one allowed false alarm, over four fits (two
// windows, three seeds): step 2 alone lands 18-21 of 24, and step 3 raises it
// to 21-22 while collapsing the spread. Allowing no false alarm at all, the
// filter is worth more: 21 against 17.
//
//   node tools/pr-cluster.mjs --days 40           report
//   node tools/pr-cluster.mjs --days 40 --write   and rebuild the rule
//
// Reads data/docs, written by tools/pr-sample.mjs. No prose is involved at any
// point: the sampler kept bags of words and threw the text away.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { availableDays, loadWindow, readDay } from '../js/pr-docs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'data/docs');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };

// Every number the method uses, in one place, each chosen and stated rather
// than fitted. A number you can read and argue with beats one a routine infers.
const DAYS = Number(arg('--days', 40));
const K_REGISTER = Number(arg('--k', 5));    // coarse. Five keeps the register in one group; ten splits it.
const K_SMALL = Number(arg('--small groups', 10)); // fine. Ten small groups, each still large enough to hold a control side.
const MIN_DF = Number(arg('--min-df', 25));  // a word must appear in this many descriptions to enter the vocabulary
const MIN_IN = 8;                            // and this many on each side of a small group before that small group can judge it
const MIN_SIDE = 40;                         // a small group needs this many on each side to judge anything
const MIN_GROUP = 0.03;                      // a group holding less than this share of the corpus is noise
const SMOOTH = 0.1;                          // added to every count in a centre, so an unseen word costs a finite amount
const PRIOR = 25;                            // appearances credited to a word outside its group, so a word seen nowhere
                                             // else is ranked by how often it was used INSIDE rather than by a tiny divisor
const ITERS = 30;
const TOP = Number(arg('--top', 1200));
const SEED = Number(arg('--seed', 12345));

const all = availableDays(DOCS);
if (!all.length) { console.error(`no sampled days in ${DOCS}; run tools/pr-sample.mjs first`); process.exit(2); }
const days = all.slice(-DAYS);
const { vocab, docs } = loadWindow(DOCS, { days, minDf: MIN_DF });
const V = vocab.length;
if (docs.length < 500) { console.error(`only ${docs.length} descriptions in ${days.length} days; too few`); process.exit(2); }

// ---- clustering ---------------------------------------------------------
// A centre is a multinomial over the vocabulary, held as logs because that is
// the only form it is ever used in.
function centreFrom(members) {
  const acc = new Float64Array(V).fill(SMOOTH);
  let tot = SMOOTH * V;
  for (const x of members) for (let j = 0; j < x.idx.length; j++) { acc[x.idx[j]] += x.val[j]; tot += x.val[j]; }
  const logW = new Float64Array(V);
  for (let v = 0; v < V; v++) logW[v] = Math.log(acc[v] / tot);
  return logW;
}

function cluster(K, label) {
  // Two centres from the labels; the rest from random parts. Seeding the
  // others from single documents made them so peaked that nothing ever joined
  // them, so every centre starts from a comparable number of documents.
  const centres = [centreFrom(docs.filter((d) => d.signed)), centreFrom(docs.filter((d) => !d.signed))];
  let seed = SEED;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const parts = Array.from({ length: Math.max(K - 2, 0) }, () => []);
  for (const d of docs) if (parts.length) parts[Math.floor(rnd() * parts.length)].push(d);
  for (const s of parts) centres.push(centreFrom(s.length ? s : docs));
  centres.length = K;

  const assign = new Int32Array(docs.length).fill(-1);
  let iters = 0;
  for (let it = 0; it < ITERS; it++) {
    iters = it + 1;
    let moved = 0;
    for (let i = 0; i < docs.length; i++) {
      const x = docs[i];
      let best = -Infinity, bestC = 0;
      for (let c = 0; c < K; c++) {
        const lw = centres[c];
        let s = 0;
        for (let j = 0; j < x.idx.length; j++) s += x.val[j] * lw[x.idx[j]];
        if (s > best) { best = s; bestC = c; }
      }
      if (assign[i] !== bestC) { assign[i] = bestC; moved++; }
    }
    const g = Array.from({ length: K }, () => []);
    for (let i = 0; i < docs.length; i++) g[assign[i]].push(docs[i]);
    for (let c = 0; c < K; c++) if (g[c].length) centres[c] = centreFrom(g[c]);
    process.stderr.write(`  ${label} k=${K}, iteration ${it + 1}: ${moved} moved      \r`);
    if (!moved) break;
  }
  process.stderr.write('\n');
  const groups = Array.from({ length: K }, () => []);
  for (let i = 0; i < docs.length; i++) groups[assign[i]].push(docs[i]);
  return { groups, assign, iters, centres };
}

const appearances = (set) => {
  const a = new Float64Array(V);
  for (const x of set) for (let j = 0; j < x.idx.length; j++) a[x.idx[j]] += x.val[j];
  return a;
};
const corpusAppearances = appearances(docs);
const corpusTotal = corpusAppearances.reduce((a, b) => a + b, 0);

// What a group is about: the words it uses more than everything else does.
function contrast(set) {
  const inside = appearances(set);
  const here = Math.max(inside.reduce((a, b) => a + b, 0), 1);
  const elsewhere = Math.max(corpusTotal - here, 1);
  const out = new Float64Array(V);
  for (let j = 0; j < V; j++)
    out[j] = (inside[j] / here) / ((corpusAppearances[j] - inside[j] + PRIOR) / elsewhere);
  return out;
}
const rankOf = (lift) => Array.from({ length: V }, (_, j) => j)
  .sort((a, b) => lift[b] - lift[a] || (vocab[a] < vocab[b] ? -1 : 1));

// ---- step 1: find the register ------------------------------------------
const coarse = cluster(K_REGISTER, 'register');
const coarseStats = coarse.groups.map((g, c) => ({
  c, size: g.length,
  signed: g.filter((x) => x.signed).length,
  share: g.length ? g.filter((x) => x.signed).length / g.length : 0,
  repos: new Set(g.map((x) => x.repo)).size,
  about: rankOf(contrast(g)).slice(0, 10).map((j) => vocab[j]),
}));
const eligible = coarseStats.filter((s) => s.size >= MIN_GROUP * docs.length);
if (!eligible.length) { console.error('no group large enough to publish'); process.exit(2); }
const register = eligible.reduce((b, s) => (!b || s.share > b.share ? s : b), null);

console.log(`${days.length} days, ${docs.length} descriptions, ${docs.filter((d) => d.signed).length} signed, ${V} words\n`);
console.log(`step 1 — which of the ${K_REGISTER} groups is the register (signatures hidden from the fit)`);
console.log('  group    size   signed   share   what it is about');
for (const s of [...coarseStats].sort((a, b) => b.share - a.share)) {
  if (!s.size) continue;
  console.log(`  ${s.c === register.c ? '->' : '  '} ${String(s.c).padStart(2)} ${String(s.size).padStart(7)} ` +
    `${String(s.signed).padStart(7)}  ${(s.share * 100).toFixed(1).padStart(5)}%   ${s.about.slice(0, 8).join(' ')}`);
}

// A second, independent way of asking the same question, purely as a check:
// does this group's vocabulary mark machine writing among descriptions that are
// NOT in it? If the two answers differ, the clustering has split the register
// and K is too high — which is a thing to be told, not to paper over.
function aucOutside(listIdx, c) {
  const inList = new Uint8Array(V);
  for (const j of listIdx) inList[j] = 1;
  const rows = [];
  for (let i = 0; i < docs.length; i++) {
    if (coarse.assign[i] === c) continue;
    const d = docs[i];
    let hit = 0, n = 0;
    for (let k = 0; k < d.idx.length; k++) { n += d.val[k]; if (inList[d.idx[k]]) hit++; }
    rows.push([hit / Math.sqrt(Math.max(n, 1)), d.signed ? 1 : 0]);
  }
  rows.sort((a, b) => a[0] - b[0]);
  let rank = 1, i = 0, sumPos = 0, nPos = 0, nNeg = 0;
  while (i < rows.length) {
    let j = i; while (j < rows.length && rows[j][0] === rows[i][0]) j++;
    const avg = (rank + rank + (j - i) - 1) / 2;
    for (let k = i; k < j; k++) { if (rows[k][1]) { sumPos += avg; nPos++; } else nNeg++; }
    rank += j - i; i = j;
  }
  return !nPos || !nNeg ? NaN : (sumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}
const aucs = eligible.map((s) => ({ c: s.c, auc: aucOutside(rankOf(contrast(coarse.groups[s.c])).slice(0, TOP), s.c) }));
const byAuc = aucs.reduce((b, s) => (!b || s.auc > b.auc ? s : b), null);
const agree = byAuc.c === register.c;
console.log(`\n  most signed: group ${register.c} at ${(register.share * 100).toFixed(1)}%` +
  `   |   best at marking machine writing elsewhere: group ${byAuc.c} at AUC ${byAuc.auc.toFixed(3)}`);
console.log(agree ? '  the two agree, so the register is one group'
                  : `  WARNING: the two disagree. The register has probably split across groups; try a smaller --k.`);

// The naive ranking — signed against unsigned over the whole corpus — kept only
// so the page and the report can show what step 2 actually changed. It is never
// published.
const naive = (() => {
  const cnt = (set) => { const m = new Map();
    for (const x of set) for (const j of x.idx) m.set(j, (m.get(j) || 0) + 1); return m; };
  const sg = docs.filter((d) => d.signed), un = docs.filter((d) => !d.signed);
  const A = cnt(sg), B = cnt(un);
  const rows = [];
  for (const [j, n] of A) {
    if (n < MIN_IN) continue;
    rows.push({ j, lift: +((n / sg.length) / (((B.get(j) || 0) + 0.5) / un.length)).toFixed(3) });
  }
  return rows.sort((a, b) => b.lift - a.lift);
})();

// ---- step 2: rank by contrast with the rest -----------------------------
const lift = contrast(coarse.groups[register.c]);
const ranked = rankOf(lift);
console.log(`\nstep 2 — ranked against the rest of the corpus, not against the unsigned half`);
console.log(`  ${ranked.slice(0, 16).map((j) => vocab[j]).join(' ')}`);

// ---- step 3: drop what belongs to a subject -----------------------------
const fine = cluster(K_SMALL, 'small groups  ');
const votes = new Map();          // word -> [{ c, lift }] one per small group that could judge it
let judging = 0;
for (let c = 0; c < K_SMALL; c++) {
  const g = fine.groups[c];
  const sg = g.filter((x) => x.signed), un = g.filter((x) => !x.signed);
  if (sg.length < MIN_SIDE || un.length < MIN_SIDE) continue;
  judging++;
  const cnt = (set) => { const m = new Map();
    for (const x of set) for (const j of x.idx) m.set(j, (m.get(j) || 0) + 1); return m; };
  const A = cnt(sg), B = cnt(un);
  for (const [j, n] of A) {
    if (n < MIN_IN) continue;
    const o = B.get(j) || 0;
    if (o < MIN_IN) continue;
    if (!votes.has(j)) votes.set(j, []);
    votes.get(j).push({ c, lift: +((n / sg.length) / ((o + 0.5) / un.length)).toFixed(3) });
  }
}
const single = (j) => (votes.get(j) || []).length === 1;
const kept = ranked.filter((j) => !single(j)).slice(0, TOP);
const dropped = ranked.filter((j) => single(j));

console.log(`\nstep 3 — ${judging} of ${K_SMALL} small groups could judge a word; ` +
  `${dropped.length} words are dense enough to measure in only one part and are dropped`);
console.log('  dropped, highest-ranked first:');
for (const j of dropped.slice(0, 10)) {
  const v = votes.get(j)[0];
  const st = fine.groups[v.c];
  console.log(`    ${vocab[j].padEnd(20)} rank ${String(ranked.indexOf(j) + 1).padStart(4)}   only in small group ${v.c}  ` +
    `(${rankOf(contrast(st)).slice(0, 5).map((k) => vocab[k]).join(' ')})`);
}
console.log(`\nthe published list, ${kept.length} words:`);
console.log('  ' + kept.slice(0, 40).map((j) => vocab[j]).join(' '));

// Every coarse group's list, built exactly the way the published one is: ranked
// by contrast, then filtered by the small groups. What a reader browses is
// therefore what would ship if that group had been the register.
const GROUP_WORDS = 400;
const perGroup = coarseStats.filter((s) => s.size).map((s) => {
  const l = contrast(coarse.groups[s.c]);
  const r = rankOf(l);
  const k = r.filter((j) => !single(j));
  return { id: s.c,
           words: (s.c === register.c ? k.slice(0, TOP) : k.slice(0, GROUP_WORDS))
             .map((j, i) => ({ w: vocab[j], rank: i + 1, lift: +l[j].toFixed(3),
                               votes: s.c === register.c ? (votes.get(j) || []) : undefined })),
           dropped: r.filter((j) => single(j)).slice(0, 60)
             .map((j) => ({ w: vocab[j], rank: r.indexOf(j) + 1, lift: +l[j].toFixed(3),
                            votes: votes.get(j) })) };
});
const tracked = new Set(perGroup.flatMap((g) => g.words.slice(0, 300).map((r) => r.w)));

// ---- the whole archive, assigned to the groups just fitted ---------------
// The fit is on the recent window, because that is what the published list is
// about. But a group is only legible if you can see where it came from, so
// every description ever sampled is then assigned to its nearest fitted centre
// -- assigned, not refitted -- and counted by week. That gives each group a
// share of the corpus over time, and each word a rate over time, without the
// groups moving underneath either.
//
// Done one day at a time so the archive never has to be in memory at once.
function assignHistory(centres, trackedWords) {
  const at = new Map(vocab.map((w, i) => [w, i]));
  const tracked = new Set(trackedWords);
  const track = new Map(trackedWords.map((w, i) => [w, i]));
  // monday -> counts. Everything is kept twice, once over all descriptions and
  // once over only the signed ones, because that split is the confirmation: a
  // word that belongs to the register should be rising on both lines and
  // sitting far higher on the signed one.
  const weeks = new Map();
  const K = centres.length;
  const T = tracked.size;
  let done = 0;
  for (const day of all) {
    let d;
    try { d = readDay(DOCS, day); } catch { continue; }
    const dt = new Date(day + 'T00:00:00Z');
    dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
    const wk = dt.toISOString().slice(0, 10);
    if (!weeks.has(wk)) weeks.set(wk, { w: wk, docs: 0, signed: 0, words: 0, wordsSigned: 0,
      byGroup: new Array(K).fill(0), byGroupSigned: new Array(K).fill(0),
      counts: new Int32Array(T), countsSigned: new Int32Array(T) });
    const e = weeks.get(wk);
    for (const doc of d.docs) {
      // decode the day's row into fit-vocabulary indices
      const idx = [], val = [];
      let cursor = 0, n = 0;
      for (let i = 3; i < doc.length; i += 2) {
        cursor += doc[i];
        const j = at.get(d.vocab[cursor]);
        n += doc[i + 1];
        if (j !== undefined) { idx.push(j); val.push(doc[i + 1]); }
      }
      const isSigned = doc[0] === 1;
      e.docs++; e.words += n;
      if (isSigned) { e.signed++; e.wordsSigned += n; }
      if (!idx.length) continue;
      let best = -Infinity, bestC = 0;
      for (let c = 0; c < K; c++) {
        const lw = centres[c];
        let s = 0;
        for (let k = 0; k < idx.length; k++) s += val[k] * lw[idx[k]];
        if (s > best) { best = s; bestC = c; }
      }
      e.byGroup[bestC]++;
      if (isSigned) e.byGroupSigned[bestC]++;
      // a tracked word's appearances, so the page can draw its rate per week
      for (let k = 0; k < idx.length; k++) {
        const ti = track.get(vocab[idx[k]]);
        if (ti === undefined) continue;
        e.counts[ti] += val[k];
        if (isSigned) e.countsSigned[ti] += val[k];
      }
    }
    if (++done % 25 === 0) process.stderr.write(`  assigning the archive: ${done}/${all.length} days   \r`);
  }
  process.stderr.write('\n');
  return [...weeks.values()].sort((a, b) => a.w.localeCompare(b.w));
}

// ---- output -------------------------------------------------------------
const trackedList = [...tracked].sort();
const series = assignHistory(coarse.centres, trackedList);
console.log(`\nassigned all ${all.length} sampled days to the ${K_REGISTER} groups: ${series.length} weeks`);
{
  const first = series[0], last = series[series.length - 1];
  const sh = (e, c) => (e.docs ? (100 * e.byGroup[c] / e.docs).toFixed(1) : '0.0');
  console.log(`  the register's share of the corpus: ${sh(first, register.c)}% in ${first.w} -> ${sh(last, register.c)}% in ${last.w}`);
}

const built = new Date().toISOString().slice(0, 10);
writeFileSync(join(ROOT, 'data/cluster-series.json'), JSON.stringify({
  built, from: series[0].w, to: series[series.length - 1].w,
  groups: coarseStats.filter((s) => s.size).map((s) => s.c),
  words: trackedList,
  schema: 'weeks[].counts[i] is appearances of words[i] that week; countsSigned[i] the same over '
        + 'signed descriptions only. Rate per million = counts[i] / words * 1e6.',
  weeks: series.map((e) => ({
    w: e.w, docs: e.docs, signed: e.signed, words: e.words, wordsSigned: e.wordsSigned,
    byGroup: e.byGroup, byGroupSigned: e.byGroupSigned,
    // dense, one slot per tracked word. Runs of zeros are what gzip is best at,
    // and a dense row is smaller here than index/count pairs.
    counts: Array.from(e.counts), countsSigned: Array.from(e.countsSigned),
  })),
}) + '\n');
console.log('wrote data/cluster-series.json');

writeFileSync(join(ROOT, 'data/cluster.json'), JSON.stringify({
  built, days, kRegister: K_REGISTER, kSmall: K_SMALL,
  descriptions: docs.length, signed: docs.filter((d) => d.signed).length, vocabulary: V,
  constants: { MIN_DF, MIN_IN, MIN_SIDE, MIN_GROUP, PRIOR, SMOOTH, TOP },
  register: { id: register.c, size: register.size, signed: register.signed,
              share: +register.share.toFixed(4), agreed: agree,
              auc: +(aucs.find((a) => a.c === register.c).auc.toFixed(4)) },
  groups: coarseStats.filter((s) => s.size).map((s) => ({
    id: s.c, size: s.size, signed: s.signed, share: +s.share.toFixed(4), repos: s.repos,
    about: s.about, register: s.c === register.c,
    auc: +((aucs.find((a) => a.c === s.c) || {}).auc || 0).toFixed(4),
    words: (perGroup.find((g) => g.id === s.c) || {}).words || [],
    dropped: (perGroup.find((g) => g.id === s.c) || {}).dropped || [],
  })),
  smallGroups: Array.from({ length: K_SMALL }, (_, c) => ({
    id: c, size: fine.groups[c].length,
    signed: fine.groups[c].filter((x) => x.signed).length,
    judged: fine.groups[c].filter((x) => x.signed).length >= MIN_SIDE
         && fine.groups[c].filter((x) => !x.signed).length >= MIN_SIDE,
    about: fine.groups[c].length ? rankOf(contrast(fine.groups[c])).slice(0, 8).map((j) => vocab[j]) : [],
  })).filter((s) => s.size),
  words: kept.map((j, i) => ({ w: vocab[j], rank: i + 1, lift: +lift[j].toFixed(3),
                               votes: votes.get(j) || [] })),
  naive: naive.slice(0, 40).map((r, i) => ({ w: vocab[r.j], rank: i + 1, lift: r.lift,
                                             kept: kept.includes(r.j) })),
  dropped: dropped.slice(0, 200).map((j) => ({ w: vocab[j], rank: ranked.indexOf(j) + 1,
                                               lift: +lift[j].toFixed(3), votes: votes.get(j) })),
}, null, 1) + '\n');
console.log('\nwrote data/cluster.json');

// One line of history per build. A word's trajectory has to accumulate: there
// is no way to recover what this would have said last month without re-running
// it on last month's window, so this records what it actually said, when.
{
  const path = join(ROOT, 'data/cluster-history.json');
  let hist = [];
  try { hist = JSON.parse(readFileSync(path, 'utf8')); } catch { /* first build */ }
  hist = hist.filter((h) => h.built !== built);
  hist.push({ built, from: days[0], to: days[days.length - 1],
              descriptions: docs.length, signed: docs.filter((d) => d.signed).length,
              register: { share: +register.share.toFixed(4), agreed: agree },
              words: Object.fromEntries(kept.slice(0, 300).map((j, i) => [vocab[j], i + 1])) });
  hist.sort((a, b) => a.built.localeCompare(b.built));
  writeFileSync(path, JSON.stringify(hist, null, 1) + '\n');
  console.log(`wrote data/cluster-history.json  (${hist.length} builds)`);
}

if (process.argv.includes('--write')) {
  const path = join(ROOT, 'candidates/ai-vocabulary.json');
  const set = JSON.parse(readFileSync(path, 'utf8'));
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const [maj, min, patch] = (set.version || '0.1.0').split('.').map(Number);
  set.version = `${maj}.${min}.${patch + 1}`;
  set.corpus = { built, days: days.length, from: days[0], to: days[days.length - 1],
                 descriptions: docs.length, signed: docs.filter((d) => d.signed).length,
                 register: `${(register.share * 100).toFixed(1)}% signed`, words: kept.length };
  set.rules[0].match.pattern = `\\b(?:${kept.map((j) => esc(vocab[j])).join('|')})\\b`;
  writeFileSync(path, JSON.stringify(set, null, 2) + '\n');
  console.log(`wrote candidates/ai-vocabulary.json v${set.version}`);
}
