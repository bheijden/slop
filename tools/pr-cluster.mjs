#!/usr/bin/env node
// Clusters pull request descriptions the way load-bearing does, but lets the
// signatures say which cluster is the machine-written one.
//
// Their k-means is genuinely good at the thing a per-word ratio cannot do: it
// finds words that TRAVEL TOGETHER. What it cannot do is know which of its ten
// clusters is the machine, so it argues from a growth curve. We know, because
// the descriptions signed themselves. So:
//
//   1. two of the k centres start from the marked and unmarked means, the rest
//      from k-means++, so the fit begins near the answer instead of guessing;
//   2. the cluster reported is the one with the highest signed share, not the
//      one that grew.
//
// The text is fetched, used and dropped inside one run. Nothing large is ever
// committed: this writes a word list, not a corpus.
//
//   node tools/pr-cluster.mjs --days 40 --k 10

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { prepare, markerRegex } from './lib/pr-corpus.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };
const DAYS = Number(arg('--days', 40));
const K = Number(arg('--k', 10));
const MIN_DF = Number(arg('--min-df', 25));   // a word must be this common to enter the vocabulary
const SMOOTH = 0.1;

const markers = JSON.parse(readFileSync(join(ROOT, 'data/markers.json'), 'utf8'));
const MARK = markerRegex(markers.confirmed);

const days = [];
for (let i = 1; i <= DAYS; i++) days.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));

const docs = [];
for (const day of days) {
  const res = await fetch(`https://raw.githubusercontent.com/louisabraham/load-bearing/main/data/days/${day}.jsonl`);
  if (!res.ok) continue;
  for (const line of (await res.text()).split('\n')) {
    if (!line.trim()) continue;
    let r; try { r = JSON.parse(line); } catch { continue; }
    const p = prepare(r, MARK);
    if (p) docs.push({ tokens: p.tokens, marked: p.marked });
  }
  process.stderr.write(`  ${day}: ${docs.length} descriptions\r`);
}
process.stderr.write('\n');
if (docs.length < 200) { console.error('too few descriptions to cluster'); process.exit(2); }

// vocabulary
const df = new Map();
for (const d of docs) for (const w of new Set(d.tokens)) df.set(w, (df.get(w) || 0) + 1);
const vocab = [...df].filter(([, n]) => n >= MIN_DF).map(([w]) => w).sort();
const index = new Map(vocab.map((w, i) => [w, i]));
const V = vocab.length;

// sparse count vectors
const X = docs.map((d) => {
  const m = new Map();
  for (const t of d.tokens) { const i = index.get(t); if (i !== undefined) m.set(i, (m.get(i) || 0) + 1); }
  return { idx: [...m.keys()], val: [...m.values()], n: d.tokens.length, marked: d.marked };
}).filter((x) => x.idx.length >= 5);

function centreFrom(members) {
  const acc = new Float64Array(V).fill(SMOOTH);
  let tot = SMOOTH * V;
  for (const x of members) for (let j = 0; j < x.idx.length; j++) { acc[x.idx[j]] += x.val[j]; tot += x.val[j]; }
  const logW = new Float64Array(V);
  for (let v = 0; v < V; v++) logW[v] = Math.log(acc[v] / tot);
  return logW;
}

// Two centres seeded from the labels, the rest from spread-out documents.
const centres = [centreFrom(X.filter((x) => x.marked)), centreFrom(X.filter((x) => !x.marked))];
for (let c = 2; c < K; c++) centres.push(centreFrom([X[Math.floor((c / K) * X.length)]]));

let assign = new Int32Array(X.length).fill(-1);
for (let iter = 0; iter < 25; iter++) {
  let moved = 0;
  for (let i = 0; i < X.length; i++) {
    const x = X[i];
    let best = -Infinity, bestC = 0;
    for (let c = 0; c < K; c++) {
      const lw = centres[c];
      let s = 0;
      for (let j = 0; j < x.idx.length; j++) s += x.val[j] * lw[x.idx[j]];
      if (s > best) { best = s; bestC = c; }
    }
    if (assign[i] !== bestC) { assign[i] = bestC; moved++; }
  }
  const groups = Array.from({ length: K }, () => []);
  for (let i = 0; i < X.length; i++) groups[assign[i]].push(X[i]);
  for (let c = 0; c < K; c++) if (groups[c].length) centres[c] = centreFrom(groups[c]);
  process.stderr.write(`  iteration ${iter + 1}: ${moved} moved\r`);
  if (!moved) break;
}
process.stderr.write('\n');

const groups = Array.from({ length: K }, () => []);
for (let i = 0; i < X.length; i++) groups[assign[i]].push(X[i]);
const stats = groups.map((g, c) => ({
  c, size: g.length, marked: g.filter((x) => x.marked).length,
  share: g.length ? g.filter((x) => x.marked).length / g.length : 0,
}));
stats.sort((a, b) => b.share - a.share);
console.log(`${X.length} descriptions, ${V} words in vocabulary, k=${K}`);
console.log('cluster   size   signed   share');
for (const s of stats) console.log(`  ${String(s.c).padStart(4)} ${String(s.size).padStart(7)} ${String(s.marked).padStart(8)}  ${(s.share * 100).toFixed(1)}%`);

const lead = stats[0].c;
const inside = groups[lead], outside = X.filter((x, i) => assign[i] !== lead);
const cnt = (set) => { const m = new Map(); for (const x of set) for (const j of x.idx) m.set(j, (m.get(j) || 0) + 1); return m; };
const A = cnt(inside), B = cnt(outside);
const rows = [];
for (const [j, n] of A) {
  const o = B.get(j) || 0;
  if (o < 20) continue;
  rows.push({ w: vocab[j], lift: (n / inside.length) / ((o + 0.5) / outside.length), inside: n, outside: o });
}
rows.sort((a, b) => b.lift - a.lift);
console.log(`\nmost-signed cluster is ${lead} at ${(stats[0].share * 100).toFixed(1)}% signed; its characteristic words:`);
console.log('  ' + rows.slice(0, 40).map((r) => r.w).join(' '));
writeFileSync(join(ROOT, 'data/cluster-words.json'), JSON.stringify({
  built: new Date().toISOString().slice(0, 10), days: DAYS, k: K,
  descriptions: X.length, leadShare: +stats[0].share.toFixed(3),
  words: rows.slice(0, 600) }, null, 1) + '\n');
console.log('\nwrote data/cluster-words.json');
