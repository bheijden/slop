#!/usr/bin/env node
// Builds the data behind web/vocabulary.html.
//
// Three things the page needs, all derived from the daily counts:
//
//   series   how much of GitHub's pull request prose signs itself, weekly,
//            split by which tool signed it
//   words    the current list, with each word's lift and how it got there
//   ranks    every word's position in the list as it would have stood at the
//            end of each month, computed by rebuilding the list at each cutoff
//
// The last one matters: it means a word's trajectory exists from the first
// build rather than only accumulating from today, so the page has something
// to show immediately and stays honest about when a word actually arrived.

import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { listDays, readDay } from './lib/counts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'data/counts');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };
const TOP = Number(arg('--top', 1000));
const MIN_UNMARKED = Number(arg('--min-unmarked', 100));
const MIN_AUTHORS = Number(arg('--min-authors', 15));

const days = listDays(DIR);
if (!days.length) { console.error('no counts'); process.exit(2); }

// ---- pass one: the final list -------------------------------------------
const all = new Map();
const totals = { marked: 0, unmarked: 0 };
const weekly = new Map();
const products = new Set();
for (const day of days) {
  const d = readDay(DIR, day);
  if (!d) continue;
  totals.marked += d.marked.docs; totals.unmarked += d.unmarked.docs;
  // ISO week starting Monday
  const dt = new Date(day + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  const wk = dt.toISOString().slice(0, 10);
  if (!weekly.has(wk)) weekly.set(wk, { w: wk, total: 0, signed: 0, by: {} });
  const e = weekly.get(wk);
  e.total += d.marked.docs + d.unmarked.docs;
  e.signed += d.marked.docs;
  for (const [p, n] of Object.entries(d.products || {})) {
    products.add(p); e.by[p] = (e.by[p] || 0) + n;
  }
  for (const [w, [md, ud, ma]] of Object.entries(d.words)) {
    const a = all.get(w) || [0, 0, 0];
    a[0] += md; a[1] += ud; a[2] += ma;
    all.set(w, a);
  }
}
const lift = (md, ud, M, U) => (md / M) / ((ud + 0.5) / U);
const ranked = [];
for (const [w, [md, ud, ma]] of all) {
  if (ud < MIN_UNMARKED || ma < MIN_AUTHORS) continue;
  const l = lift(md, ud, totals.marked, totals.unmarked);
  if (l <= 1) continue;
  ranked.push({ w, lift: +l.toFixed(3), m: md, u: ud, a: ma });
}
ranked.sort((a, b) => b.lift - a.lift);
const keep = ranked.slice(0, TOP);
const wanted = new Set(keep.map((r) => r.w));

// ---- pass two: where each of them stood, month by month ------------------
const months = [...new Set(days.map((d) => d.slice(0, 7)))].sort();
const run = new Map();                       // word -> [marked, unmarked, authors]
const runTotals = { marked: 0, unmarked: 0 };
const rankAt = new Map(keep.map((r) => [r.w, []]));
const liftAt = new Map(keep.map((r) => [r.w, []]));
// A word's own line is the score *within* each month, not the running total,
// so it shows movement rather than a curve settling. Its floor is lower for
// the same reason: one month holds a fortieth of the corpus.
const MONTH_FLOOR = Math.max(5, Math.round(MIN_UNMARKED / 12));
for (const month of months) {
  const mth = new Map();
  const mthTotals = { marked: 0, unmarked: 0 };
  for (const day of days.filter((d) => d.startsWith(month))) {
    const d = readDay(DIR, day);
    if (!d) continue;
    runTotals.marked += d.marked.docs; runTotals.unmarked += d.unmarked.docs;
    mthTotals.marked += d.marked.docs; mthTotals.unmarked += d.unmarked.docs;
    for (const [w, [md, ud, ma]] of Object.entries(d.words)) {
      if (!wanted.has(w)) continue;
      const a = run.get(w) || [0, 0, 0];
      a[0] += md; a[1] += ud; a[2] += ma;
      run.set(w, a);
      const b = mth.get(w) || [0, 0];
      b[0] += md; b[1] += ud;
      mth.set(w, b);
    }
  }
  const snap = [];
  for (const [w, [md, ud, ma]] of run) {
    if (ud < MIN_UNMARKED || ma < MIN_AUTHORS || !runTotals.marked) continue;
    const l = lift(md, ud, runTotals.marked, runTotals.unmarked);
    if (l > 1) snap.push([w, l]);
  }
  snap.sort((a, b) => b[1] - a[1]);
  const pos = new Map(snap.map(([w], i) => [w, i + 1]));
  for (const r of keep) {
    rankAt.get(r.w).push(pos.get(r.w) ?? null);
    const e = mth.get(r.w);
    liftAt.get(r.w).push(e && mthTotals.marked && e[1] >= MONTH_FLOOR
      ? +lift(e[0], e[1], mthTotals.marked, mthTotals.unmarked).toFixed(2) : null);
  }
}

const out = {
  built: new Date().toISOString().slice(0, 10),
  days: days.length, from: days[0], to: days[days.length - 1],
  totals: { ...totals, descriptions: totals.marked + totals.unmarked, vocabulary: all.size },
  floors: { unmarked: MIN_UNMARKED, authors: MIN_AUTHORS },
  products: [...products],
  series: [...weekly.values()].sort((a, b) => a.w.localeCompare(b.w)),
  months,
  words: keep.map((r, i) => ({ ...r, rank: i + 1, ranks: rankAt.get(r.w), hist: liftAt.get(r.w) })),
};
const json = JSON.stringify(out);
writeFileSync(join(ROOT, 'web/vocabulary-data.json'), json + '\n');
console.log(`${days.length} days, ${totals.marked} signed of ${totals.marked + totals.unmarked}`);
console.log(`${all.size} words seen, ${ranked.length} clear the floors, ${keep.length} published`);
console.log(`${out.series.length} weeks, ${months.length} months, products: ${[...products].filter((p) => out.series.some((s) => s.by[p])).join(', ')}`);
console.log(`web/vocabulary-data.json  ${(json.length / 1024).toFixed(0)} KB (${(gzipSync(Buffer.from(json)).length / 1024).toFixed(0)} KB gzipped)`);
