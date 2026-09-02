#!/usr/bin/env node
// Samples one day of public pull request descriptions and keeps each one as a
// bag of words.
//
// The earlier version of this kept only per-word totals for the day, which is
// enough to ask "how often does this word appear on the signed side" and
// nothing else. That question turned out to be the wrong one: it cannot tell a
// word that belongs to a *subject* from a word that belongs to a *way of
// writing*, because both are simply more common on one side. Separating those
// two needs to know which words occurred together in the same description, so
// the document is now the unit that is stored.
//
// What is stored is a bag of words, not prose. Order is gone, the signature is
// gone, and the account name is replaced by a number that is only meaningful
// inside its own day. That is everything the clustering needs and nothing else.
//
//   node tools/pr-sample.mjs 2026-09-01              one day
//   node tools/pr-sample.mjs 2026-08-01..2026-09-01  a range
//   node tools/pr-sample.mjs --backfill 5            the 5 oldest missing days
//   node tools/pr-sample.mjs --source search 2026-09-01
//   node tools/pr-sample.mjs --archive ./days 2025-01-01..2026-09-01
//
// Two ways to get a day's descriptions, and the file records which was used.
//
//   search   our own: ten five-minute windows drawn from the date, so any day
//            can be re-collected to the second, including days long past. One
//            day costs ten requests and about fifty seconds.
//   archive  a day already published as one JSONL file of {ts, repo, author,
//            body} records. One request, no pacing, and it reaches back to the
//            start of 2025. This is how history gets seeded rather than
//            crawled a day at a time for months.
//
// The default is to take the archive where it has the day and sample where it
// does not, which in practice means history comes from the archive and every
// day from here on is our own. The two are collected differently, so the file
// says which, and a fit whose window straddles the seam is comparing two
// samples rather than one.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { prepare, markerRegex, toolWordFilter, searchPRs, windowsForDay } from './lib/pr-corpus.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'data/docs');
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const arg = (n, d) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };
const FORCE = process.argv.includes('--force');
const SOURCE = arg('--source', 'auto');            // auto | archive | search
const ARCHIVE_DIR = arg('--archive', null);        // a local directory of <day>.jsonl
const ARCHIVE_URL = arg('--archive-url',
  'https://raw.githubusercontent.com/louisabraham/load-bearing/main/data/days');

// A word seen once in a day is nearly always an identifier, a version number or
// a typo. Dropping them halves the file and removes nothing that a cluster
// could ever be built from.
const DAY_DF_MIN = 2;
// The first day worth collecting. The search index reaches back further, but
// the tools that sign their work arrived through the first half of 2025, and
// before that the signed side is too thin to have a control group at all.
const EARLIEST = '2025-01-01';

const markers = JSON.parse(readFileSync(join(ROOT, 'data/markers.json'), 'utf8'));
const MARK = markerRegex(markers.confirmed);
const isToolWord = toolWordFilter(markers);
const BY_PRODUCT = markers.confirmed.map((m) => ({ product: m.product, re: new RegExp(m.pattern, 'i') }));

const dayFile = (day) => join(DIR, `${day}.json.gz`);
const iso = (d) => d.toISOString().slice(0, 10);

function allDays(from, to) {
  const out = [];
  for (const d = new Date(from + 'T00:00:00Z'); d <= new Date(to + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1))
    out.push(iso(d));
  return out;
}

// Which days to do. --backfill fills history from the oldest gap forward, so a
// nightly job that samples yesterday and backfills a handful of days walks the
// archive backwards on its own without anyone scheduling it.
mkdirSync(DIR, { recursive: true });
const yesterday = iso(new Date(Date.now() - 86400000));
let days;
const backfill = arg('--backfill', null);
if (backfill) {
  const have = new Set(readdirSync(DIR).filter((f) => f.endsWith('.json.gz')).map((f) => f.slice(0, 10)));
  days = allDays(EARLIEST, yesterday).filter((d) => !have.has(d)).slice(0, Number(backfill));
} else {
  const spec = process.argv.slice(2).find((a) => /^\d{4}-\d{2}-\d{2}/.test(a)) || yesterday;
  const [from, to] = spec.split('..');
  days = allDays(from, to || from);
}
if (!days.length) { console.log('nothing to sample'); process.exit(0); }

// One published day, as newline-delimited {ts, repo, author, body}. Returns
// null when that day is not in the archive, which is the signal to sample.
async function fromArchive(day) {
  let text;
  if (ARCHIVE_DIR) {
    const p = join(ARCHIVE_DIR, `${day}.jsonl`);
    if (!existsSync(p)) return null;
    text = readFileSync(p, 'utf8');
  } else {
    const res = await fetch(`${ARCHIVE_URL}/${day}.jsonl`);
    if (!res.ok) return null;
    text = await res.text();
  }
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* a truncated last line */ }
  }
  return out.length ? out : null;
}

async function ownSample(day) {
  const out = [];
  for (const w of windowsForDay(day)) {
    for (const it of await searchPRs(w, TOKEN))
      out.push({ author: it.user?.login, body: it.body, repo: it.repository_url, type: it.user?.type });
    await new Promise((r) => setTimeout(r, 2200));   // 30 searches a minute, with room
  }
  return out;
}

for (const day of days) {
  const out = dayFile(day);
  if (existsSync(out) && !FORCE) { console.log(`${day}  already sampled`); continue; }

  let raw = null, source = null;
  if (SOURCE === 'auto' || SOURCE === 'archive') { raw = await fromArchive(day); source = 'archive'; }
  if (!raw) {
    if (SOURCE === 'archive') { console.log(`${day}  not in the archive`); continue; }
    raw = await ownSample(day); source = 'search';
  }

  // First pass: usable descriptions, and the day's word frequencies.
  const kept = [];
  const df = new Map();
  const products = Object.fromEntries(BY_PRODUCT.map((p) => [p.product, 0]));
  for (const rec of raw) {
    const p = prepare(rec, MARK);
    if (!p) continue;
    if (p.marked) for (const bp of BY_PRODUCT) if (bp.re.test(p.footer)) products[bp.product]++;
    const bag = new Map();
    for (const w of p.tokens) {
      if (isToolWord(w)) continue;
      bag.set(w, (bag.get(w) || 0) + 1);
    }
    if (!bag.size) continue;
    for (const w of bag.keys()) df.set(w, (df.get(w) || 0) + 1);
    kept.push({ ...p, bag });
  }

  // Second pass: a vocabulary for the day, then each description as index/count
  // pairs against it. Accounts and repositories become numbers, so the file can
  // still say "these two came from the same place" without naming either.
  const vocab = [...df].filter(([, n]) => n >= DAY_DF_MIN).map(([w]) => w).sort();
  const at = new Map(vocab.map((w, i) => [w, i]));
  const authors = new Map(), repos = new Map();
  const id = (m, k) => { if (!m.has(k)) m.set(k, m.size); return m.get(k); };

  const docs = [];
  let signed = 0;
  const signedAuthors = new Set(), unsignedAuthors = new Set();
  for (const k of kept) {
    // Sorted, and the index stored as a step from the one before. Runs of small
    // numbers are what gzip is good at: it takes a third off the file for four
    // lines of code, and js/pr-docs.mjs undoes it on the way back in.
    const pairs = [];
    for (const [w, n] of k.bag) { const i = at.get(w); if (i !== undefined) pairs.push([i, n]); }
    if (pairs.length < 5) continue;                  // fewer than 5 distinct known words
    pairs.sort((a, b) => a[0] - b[0]);
    const flat = [];
    let prev = 0;
    for (const [i, n] of pairs) { flat.push(i - prev, n); prev = i; }
    const a = id(authors, k.author), r = id(repos, k.repo);
    docs.push([k.marked ? 1 : 0, a, r, ...flat]);
    if (k.marked) { signed++; signedAuthors.add(a); } else unsignedAuthors.add(a);
  }

  writeFileSync(out, gzipSync(Buffer.from(JSON.stringify({
    date: day,
    source,
    generated: iso(new Date()),
    scanned: raw.length,
    signed: { docs: signed, authors: signedAuthors.size },
    unsigned: { docs: docs.length - signed, authors: unsignedAuthors.size },
    products,
    schema: 'docs: [signed, authorId, repoId, then (indexStep, count) pairs; indices are cumulative into vocab]',
    vocab,
    docs,
  }), 'utf8'), { level: 9 }));

  const kb = (readFileSync(out).length / 1024).toFixed(0);
  console.log(`${day}  ${source.padEnd(7)} ${docs.length}/${raw.length} kept  signed ${signed}  unsigned ${docs.length - signed}  ${vocab.length} words  ${kb} KB`);
}
