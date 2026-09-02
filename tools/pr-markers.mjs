#!/usr/bin/env node
// Finds attribution footers that data/markers.json does not yet know about.
//
// It proposes and never decides. Which agents exist is the one fact here that
// goes stale on its own, so it is discovered rather than hardcoded; but adding
// one changes what the whole corpus counts as machine-written, so a person
// confirms it. CI carries the proposals in a pull request that is rewritten
// every run, so an unmerged proposal that stops appearing simply goes away.
//
//   node tools/pr-markers.mjs --days 14              scan recent days
//   node tools/pr-markers.mjs --days 14 --write      write the proposals file
//
// Reads upstream's archive when it can, because it is already collected; falls
// back to sampling the search API ourselves.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { FOOTER, SENTINEL, splitFooter, BOT_LOGIN, searchPRs, windowsForDay } from './lib/pr-corpus.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };
const DAYS = Number(arg('--days', 14));
const MIN_SEEN = Number(arg('--min-seen', 3));      // a footer must recur to be worth reading
const MIN_AUTHORS = Number(arg('--min-authors', 2)); // and be used by more than one person
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

const markers = JSON.parse(readFileSync(join(ROOT, 'data/markers.json'), 'utf8'));
const known = new RegExp([...markers.confirmed, ...markers.rejected].map((m) => m.pattern).join('|'), 'i');

const seen = new Map();   // normalised footer -> {count, authors:Set, example}
function note(footer, author) {
  for (const raw of footer.split('\n')) {
    const line = raw.trim();
    const sentinel = new RegExp(SENTINEL.source).exec(line);
    if (!line || !(FOOTER.test(line) || sentinel || /^🤖|^👾/.test(line))) continue;
    if (known.test(line)) continue;
    // Normalise away what varies between copies of one footer. A sentinel is
    // its own key: stripping <...> to drop the email from "Co-authored-by: X
    // <a@b>" would otherwise erase the whole comment and leave nothing.
    const key = sentinel ? sentinel[1].toLowerCase() : line.toLowerCase()
      .replace(/\(https?:[^)]*\)/g, '').replace(/<[^>]*>/g, '')
      .replace(/[`*_[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 70);
    if (!key) continue;
    if (!seen.has(key)) seen.set(key, { count: 0, authors: new Set(), example: line.slice(0, 120) });
    const s = seen.get(key);
    s.count++; s.authors.add(author);
  }
}

async function fromUpstream(day) {
  const res = await fetch(`https://raw.githubusercontent.com/louisabraham/load-bearing/main/data/days/${day}.jsonl`);
  if (!res.ok) return null;
  const out = [];
  for (const line of (await res.text()).split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* a truncated line */ }
  }
  return out;
}

const days = [];
for (let i = 1; i <= DAYS; i++) days.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));

let scanned = 0;
for (const day of days) {
  let recs = await fromUpstream(day);
  if (!recs) {
    recs = [];
    for (const w of windowsForDay(day)) {
      recs.push(...(await searchPRs(w, TOKEN)).map((it) => ({ author: it.user?.login, body: it.body })));
      await new Promise((r) => setTimeout(r, 2200));
    }
  }
  for (const r of recs) {
    const author = r.author || '';
    if (BOT_LOGIN.test(author)) continue;
    scanned++;
    note(splitFooter(r.body || '').footer, author);
  }
  process.stderr.write(`  ${day}: ${scanned} descriptions scanned\r`);
}
process.stderr.write('\n');

const proposals = [...seen.entries()]
  .filter(([, s]) => s.count >= MIN_SEEN && s.authors.size >= MIN_AUTHORS)
  .map(([key, s]) => ({ footer: key, seen: s.count, authors: s.authors.size, example: s.example }))
  .sort((a, b) => b.seen - a.seen);

console.log(`scanned ${scanned} descriptions over ${days.length} days`);
console.log(`${proposals.length} unrecognised footers seen at least ${MIN_SEEN} times by ${MIN_AUTHORS}+ people`);
for (const p of proposals.slice(0, 25)) console.log(`  ${String(p.seen).padStart(4)}x  ${p.authors} authors  ${p.footer}`);

if (process.argv.includes('--write')) {
  writeFileSync(join(ROOT, 'data/marker-proposals.json'), JSON.stringify({
    generated: new Date().toISOString().slice(0, 10), scanned, days: days.length,
    note: 'Proposed by tools/pr-markers.mjs. Move a real agent into markers.json confirmed, '
        + 'anything else into rejected. This file is rewritten every run.',
    proposals }, null, 2) + '\n');
  console.log('wrote data/marker-proposals.json');
}
