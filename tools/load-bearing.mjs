#!/usr/bin/env node
// Builds rules/load-bearing.json from louisabraham/load-bearing.
//
// Upstream refits daily and publishes the cheapest of eight restarts, so the
// thousand-word boundary moves between runs: measured over five days it was
// unchanged three times and turned over 20% once, from a refit rather than from
// anyone writing differently. Freezing one day's list ships one draw of that
// noise. Pooling the recent ones averages it, and scores the same.
//
//   node tools/load-bearing.mjs            build from the last 28 days
//   node tools/load-bearing.mjs --check    report churn, write nothing
//   node tools/load-bearing.mjs --days 60
//   node tools/load-bearing.mjs --bootstrap   take the list whatever the churn
//
// This needs nothing but upstream. It reads their word list and writes ours,
// so it can run unattended forever.
//
// Exit 0 wrote or nothing to do, 1 churn over the ceiling, 2 could not fetch.

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'louisabraham/load-bearing';
// A word has to appear in at least two of the pooled days to count. One
// appearance is a single fit's answer; two is the least that can be repeated.
const MIN_SNAPSHOTS = 2;
// Below this the list is the same list and a rebuild is churn for its own sake.
const CHURN_FLOOR = 0.10;
// Above this the method changed rather than the data: upstream moved to ten
// windows a day on 2026-08-28 and 63% of the list went with it.
const CHURN_CEILING = 0.40;

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? dflt : process.argv[i + 1];
};
const gh = (path) => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 1 << 28 }));

function leadWords(js) {
  const d = JSON.parse(js.slice(js.indexOf('{')).trim().replace(/;$/, ''));
  const lead = d.components.find((c) => c.lead);
  if (!lead) throw new Error('no lead component; upstream may have changed shape');
  return { generated: d.generated, words: lead.word_list, lift: lead.word_lift,
           share: lead.share, endShare: lead.end_share, documents: d.documents };
}

async function snapshots(days) {
  const commits = gh(`repos/${REPO}/commits?path=analysis.js&per_page=${days}`);
  const out = [];
  for (const c of commits) {
    const url = `https://raw.githubusercontent.com/${REPO}/${c.sha}/analysis.js`;
    const res = await fetch(url);
    if (!res.ok) continue;
    try { out.push(leadWords(await res.text())); } catch { /* an older shape */ }
  }
  if (!out.length) { console.error('load-bearing: could not fetch any snapshot'); process.exit(2); }
  return out;
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(readFileSync(new URL(import.meta.url), 'utf8')
    .split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  process.exit(0);
}

const days = Number(arg('--days', 28));
const all = await snapshots(days);
// Pool back only as far as the last break. Upstream changed method on
// 2026-08-28 and 63% of the list went with it, so a window that spans that
// would pool two different measurements into one. A day-to-day move that large
// is never data, so the newest run of comparable snapshots is the window.
const snaps = [all[0]];
for (let i = 1; i < all.length; i++) {
  const a = new Set(all[i - 1].words), b = all[i].words;
  const moved = b.filter((w) => !a.has(w)).length / b.length;
  if (moved > CHURN_CEILING) {
    console.log(`  stopping at ${all[i].generated}: ${(moved * 100).toFixed(0)}% from the day after it, a change of method`);
    break;
  }
  snaps.push(all[i]);
}
const seen = new Map();
for (const s of snaps) for (const w of new Set(s.words)) seen.set(w, (seen.get(w) || 0) + 1);
// Keep upstream's own order, taken from the newest snapshot that has the word,
// so the list reads most-characteristic-first the way their page shows it.
const rank = new Map();
for (const s of snaps) s.words.forEach((w, i) => { if (!rank.has(w)) rank.set(w, i); });
const pooled = [...seen].filter(([, n]) => n >= Math.min(MIN_SNAPSHOTS, snaps.length))
  .map(([w]) => w).sort((a, b) => rank.get(a) - rank.get(b));

const current = (() => {
  try {
    const j = JSON.parse(readFileSync(join(ROOT, 'rules/load-bearing.json'), 'utf8'));
    return j.rules[0].match.pattern.replace(/^\\b\(\?:|\)\\b$/g, '').split('|')
      .map((w) => w.replace(/\\(.)/g, '$1'));
  } catch { return null; }
})();

const churn = current ? [...new Set(pooled)].filter((w) => !current.includes(w)).length / pooled.length : 1;
const pct = (churn * 100).toFixed(1);
console.log(`load-bearing: ${snaps.length} snapshots, ${snaps[0].generated} back to ${snaps[snaps.length - 1].generated}`);
console.log(`  pooled ${pooled.length} words appearing in >= ${Math.min(MIN_SNAPSHOTS, snaps.length)} of them`);
console.log(`  churn against ours: ${current ? `${pct}%` : 'no current list'}`);

const bootstrap = process.argv.includes('--bootstrap');
if (current && churn > CHURN_CEILING && !bootstrap) {
  console.error(`load-bearing: churn ${pct}% is over the ${CHURN_CEILING * 100}% ceiling.`);
  console.error('  That size of move upstream has meant a change of method, not of data.');
  console.error('  Read what changed and re-audit the threshold before taking it.');
  process.exit(1);
}
if (current && churn < CHURN_FLOOR && !bootstrap) {
  console.log(`  under the ${CHURN_FLOOR * 100}% floor: the same list, refit. Nothing written.`);
  process.exit(0);
}
if (process.argv.includes('--check')) { console.log('  --check: nothing written'); process.exit(0); }

const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const path = join(ROOT, 'rules/load-bearing.json');
const set = JSON.parse(readFileSync(path, 'utf8'));
const [maj, min, patch] = (set.version || '0.1.0').split('.').map(Number);
set.version = `${maj}.${min}.${patch + 1}`;
set.snapshot = { taken: new Date().toISOString().slice(0, 10), upstream: snaps[0].generated,
                 snapshots: snaps.length, words: pooled.length,
                 documents: snaps[0].documents, share: snaps[0].endShare };
set.rules[0].match.pattern = `\\b(?:${pooled.map(esc).join('|')})\\b`;
writeFileSync(path, JSON.stringify(set, null, 2) + '\n');
console.log(`  wrote rules/load-bearing.json v${set.version}, ${pooled.length} words`);
