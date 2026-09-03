#!/usr/bin/env node
// Builds the data behind web/vocabulary.html.
//
// Four things the page needs:
//
//   series    how much of GitHub's pull request prose signs itself, weekly,
//             split by which tool signed it. From the daily sample summaries.
//   groups    the coarse clustering, and which of its groups was taken as the
//             register
//   naive     what ranking by the signature alone would have published, and
//             which of those words survived
//   words     the published list, each with its lift and the small groups it was
//             measured in
//   dropped   words the ranking put high and the small groups removed, each
//             with the one subject it turned out to live in
//
// The last two are the page's argument, so they are data rather than prose.
//
// Everything comes from data/docs (the sample) and data/cluster.json plus
// data/cluster-history.json (the fit). Nothing is recomputed here.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { availableDays, readSummaries } from '../js/pr-docs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'data/docs');

const days = availableDays(DOCS);
if (!days.length) { console.error('no sampled days; run tools/pr-sample.mjs'); process.exit(2); }
const clusterPath = join(ROOT, 'data/cluster.json');
if (!existsSync(clusterPath)) { console.error('no data/cluster.json; run tools/pr-cluster.mjs'); process.exit(2); }
const cluster = JSON.parse(readFileSync(clusterPath, 'utf8'));
let history = [];
try { history = JSON.parse(readFileSync(join(ROOT, 'data/cluster-history.json'), 'utf8')); } catch { /* first build */ }
const seriesPath = join(ROOT, 'data/cluster-series.json');
if (!existsSync(seriesPath)) { console.error('no data/cluster-series.json; run tools/pr-cluster.mjs'); process.exit(2); }
const series = JSON.parse(readFileSync(seriesPath, 'utf8'));

// ---- the sample, week by week -------------------------------------------
const summaries = readSummaries(DOCS, days);
const weekly = new Map();
const products = new Set();
const totals = { signed: 0, unsigned: 0, scanned: 0 };
for (const s of summaries) {
  totals.signed += s.signed.docs;
  totals.unsigned += s.unsigned.docs;
  totals.scanned += s.scanned;
  const dt = new Date(s.date + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));   // ISO week, Monday
  const wk = dt.toISOString().slice(0, 10);
  if (!weekly.has(wk)) weekly.set(wk, { w: wk, total: 0, signed: 0, days: 0, by: {} });
  const e = weekly.get(wk);
  e.total += s.signed.docs + s.unsigned.docs;
  e.signed += s.signed.docs;
  e.days++;
  for (const [p, n] of Object.entries(s.products || {})) { products.add(p); e.by[p] = (e.by[p] || 0) + n; }
}

// ---- per-word trajectory across builds ----------------------------------
// A word's rank as each build reported it. Ranks, not lifts: the lift is a
// contrast against a corpus that changes underneath it, and rank is what a
// reader actually wants — is this word climbing or falling.
const builds = history.map((h) => h.built);
const trajectory = (w) => history.map((h) => h.words[w] ?? null);

const out = {
  built: cluster.built,
  sample: {
    days: days.length, from: days[0], to: days[days.length - 1],
    scanned: totals.scanned, descriptions: totals.signed + totals.unsigned,
    signed: totals.signed, unsigned: totals.unsigned,
  },
  fit: {
    days: cluster.days.length, from: cluster.days[0], to: cluster.days[cluster.days.length - 1],
    descriptions: cluster.descriptions, signed: cluster.signed,
    vocabulary: cluster.vocabulary,
    kRegister: cluster.kRegister, kSmall: cluster.kSmall,
    constants: cluster.constants,
  },
  register: cluster.register,
  smallGroups: cluster.smallGroups,
  naive: cluster.naive,
  // Every group's own list, so a reader can page through all of them and see
  // what would have shipped had a different one been the register. Plus the
  // whole archive assigned to those groups, week by week, which is where each
  // group's share of the corpus and each word's rate over time come from.
  browse: cluster.groups.map((g) => ({
    id: g.id, register: g.register, share: g.share, size: g.size, signed: g.signed,
    about: g.about, words: g.words, dropped: g.dropped,
  })),
  history: {
    from: series.from, to: series.to, order: series.groups, words: series.words,
    weeks: series.weeks,
  },
  products: [...products],
  series: [...weekly.values()].sort((a, b) => a.w.localeCompare(b.w)),
  groups: cluster.groups,
  builds,
  words: cluster.words.slice(0, 1000).map((r) => ({
    w: r.w, rank: r.rank, lift: r.lift, votes: r.votes, hist: trajectory(r.w),
  })),
  dropped: cluster.dropped.map((r) => ({ w: r.w, rank: r.rank, lift: r.lift, votes: r.votes })),
};

const json = JSON.stringify(out);
writeFileSync(join(ROOT, 'web/vocabulary-data.json'), json + '\n');

// Stamp the page with the build it belongs to. The page appends this to its
// fetch, so a browser that has cached one of the two files cannot pair it with
// a fresh copy of the other and fail in a way that looks like a drawing bug.
{
  const pagePath = join(ROOT, 'web/vocabulary.html');
  const stamp = `${out.built}-${cluster.register.id}-${out.words.length}`;
  const page = readFileSync(pagePath, 'utf8');
  const next = page.replace(/<body(?: data-built="[^"]*")?>/, `<body data-built="${stamp}">`);
  if (next !== page) { writeFileSync(pagePath, next); console.log(`stamped web/vocabulary.html with ${stamp}`); }
}
console.log(`sample: ${days.length} days, ${totals.signed} signed of ${totals.signed + totals.unsigned}`);
console.log(`fit:    ${cluster.descriptions} descriptions, register is group ${cluster.register.id} at ` +
  `${(cluster.register.share * 100).toFixed(1)}% signed, ${cluster.words.length} words, ${cluster.dropped.length} shown as dropped`);
console.log(`${out.series.length} weeks of sample, ${series.weeks.length} weeks of assigned archive, ` +
  `${cluster.groups.length} groups browsable, ${series.words.length} words with a rate history`);
console.log(`products: ${[...products].filter((p) => out.series.some((s) => s.by[p])).join(', ')}`);
console.log(`web/vocabulary-data.json  ${(json.length / 1024).toFixed(0)} KB (${(gzipSync(Buffer.from(json)).length / 1024).toFixed(0)} KB gzipped)`);
