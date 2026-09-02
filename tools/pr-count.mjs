#!/usr/bin/env node
// Turns one day of pull request descriptions into one day of word counts, and
// throws the text away.
//
// The text is the thing that grows without bound; the counts are what the word
// list is actually built from. Upstream keeps 2 MB of prose per day forever.
// This keeps one file per day of counts, which is smaller, and keeps it *per
// day* rather than folded into a running total, so a word's history stays
// readable and any window can be re-derived later. Gzipped, because a table of
// integers compresses 3.5x and nothing is lost by it: 48 MB for the whole
// backfill against 331 MB plain, and about 29 MB a year after that.
//
//   node tools/pr-count.mjs 2026-09-01            one day
//   node tools/pr-count.mjs 2026-08-01..2026-09-01  a range
//   node tools/pr-count.mjs --source search 2026-09-01
//
// Source defaults to upstream's archive when the day is in it, because it is
// already collected and costs one request; otherwise we sample ourselves.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { prepare, markerRegex, toolWordFilter, searchPRs, windowsForDay } from './lib/pr-corpus.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'data/counts');
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const arg = (n, d) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };
const SOURCE = arg('--source', 'auto');
const FORCE = process.argv.includes('--force');

const markers = JSON.parse(readFileSync(join(ROOT, 'data/markers.json'), 'utf8'));
const MARK = markerRegex(markers.confirmed);
// Per product as well as in total, so the page can show which tools are
// signing and how that mix moves. One description can carry two signatures.
const isToolWord = toolWordFilter(markers);
const BY_PRODUCT = markers.confirmed.map((m) => ({ product: m.product, re: new RegExp(m.pattern, 'i') }));

const spec = process.argv.slice(2).find((a) => /^\d{4}-\d{2}-\d{2}/.test(a));
if (!spec) { console.error('usage: pr-count.mjs YYYY-MM-DD[..YYYY-MM-DD]'); process.exit(2); }
const [from, to] = spec.split('..');
const days = [];
for (let d = new Date(from + 'T00:00:00Z'); d <= new Date((to || from) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1))
  days.push(d.toISOString().slice(0, 10));

async function upstream(day) {
  const res = await fetch(`https://raw.githubusercontent.com/louisabraham/load-bearing/main/data/days/${day}.jsonl`);
  if (!res.ok) return null;
  const out = [];
  for (const line of (await res.text()).split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* truncated */ }
  }
  return out;
}

async function ownSample(day) {
  const out = [];
  for (const w of windowsForDay(day)) {
    for (const it of await searchPRs(w, TOKEN)) out.push({ author: it.user?.login, body: it.body, repo: it.repository_url });
    await new Promise((r) => setTimeout(r, 2200));
  }
  return out;
}

mkdirSync(DIR, { recursive: true });
for (const day of days) {
  const out = join(DIR, `${day}.json.gz`);
  if (existsSync(out) && !FORCE) { console.log(`${day}  already counted`); continue; }
  let recs = null, source = SOURCE;
  if (SOURCE === 'auto' || SOURCE === 'upstream') { recs = await upstream(day); source = 'upstream'; }
  if (!recs) { recs = await ownSample(day); source = 'search'; }

  const W = new Map();   // word -> [markedDocs, unmarkedDocs, markedAuthorSet, unmarkedAuthorSet]
  const totals = { marked: { docs: 0, authors: new Set() }, unmarked: { docs: 0, authors: new Set() } };
  const products = Object.fromEntries(BY_PRODUCT.map((p) => [p.product, 0]));
  let seen = 0, used = 0;
  for (const rec of recs) {
    seen++;
    const p = prepare(rec, MARK);
    if (!p) continue;
    used++;
    if (p.marked) for (const bp of BY_PRODUCT) if (bp.re.test(p.footer)) products[bp.product]++;
    const side = p.marked ? 0 : 1;
    const t = p.marked ? totals.marked : totals.unmarked;
    t.docs++; t.authors.add(p.author);
    for (const w of new Set(p.tokens)) {
      if (isToolWord(w)) continue;
      if (!W.has(w)) W.set(w, [0, 0, new Set(), new Set()]);
      const e = W.get(w);
      e[side]++; e[side + 2].add(p.author);
    }
  }
  const words = {};
  for (const [w, e] of W) words[w] = [e[0], e[1], e[2].size, e[3].size];
  writeFileSync(out, gzipSync(Buffer.from(JSON.stringify({
    date: day, source, generated: new Date().toISOString().slice(0, 10),
    scanned: seen, used,
    marked: { docs: totals.marked.docs, authors: totals.marked.authors.size },
    unmarked: { docs: totals.unmarked.docs, authors: totals.unmarked.authors.size },
    products,
    schema: 'word -> [markedDocs, unmarkedDocs, markedAuthors, unmarkedAuthors]',
    words }), 'utf8'), { level: 9 }));
  const kb = (readFileSync(out).length / 1024).toFixed(0);
  console.log(`${day}  ${source.padEnd(8)} ${used}/${seen} used  marked ${totals.marked.docs}  unmarked ${totals.unmarked.docs}  ${Object.keys(words).length} words  ${kb} KB`);
}
