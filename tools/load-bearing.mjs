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
//   node tools/load-bearing.mjs --mine DIR  score each word against a corpus
//
// --mine reads DIR/human and DIR/ai and reports the words that separate on
// their own, which is what a rule in ai-tells needs. It proposes and does not
// promote: a word that clears the bar here still gets read before it ships,
// the same as every other rule in that set.
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

// A word earns its own rule by appearing in almost no human document and a
// good share of AI ones. The bar is stated here rather than chosen per word.
const MINE_MAX_HUMAN = 0.02;   // at most 2% of human documents
const MINE_MIN_AI = 0.20;      // at least 20% of AI documents
// Two independent sources have to agree. Eighteen AI documents against twelve
// hundred words will hand you a few winners by chance alone, and upstream's
// lift is measured over 461,000 documents, so a word has to be characteristic
// there as well. Without this floor the bar also returns absorb, confined and
// discipline, none of which upstream ranks at all.
const MINE_MIN_LIFT = 10;

async function mine(dir, pooled, LIFT) {
  const { readdirSync } = await import('node:fs');
  const { extractorFor } = await import('../js/extract.mjs');
  const read = (kind) => readdirSync(join(dir, kind))
    .filter((f) => /\.(txt|md|html)$/i.test(f))
    .map((f) => {
      const t = extractorFor(f)(readFileSync(join(dir, kind, f), 'utf8'), {}).text;
      return { file: f, text: t, words: (t.match(/[A-Za-z][A-Za-z'\u2019-]*/g) || []).length };
    }).filter((d) => d.words >= 250);
  const H = read('human'), A = read('ai');
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rows = [];
  for (const w of pooled) {
    if ((LIFT.get(w) || 0) < MINE_MIN_LIFT) continue;
    const re = new RegExp(`\\b${esc(w)}\\b`, 'i');
    const h = H.filter((d) => re.test(d.text)).length;
    const a = A.filter((d) => re.test(d.text)).length;
    if (h / H.length <= MINE_MAX_HUMAN && a / A.length >= MINE_MIN_AI) rows.push({ w, h, a, lift: LIFT.get(w) });
  }
  rows.sort((x, y) => y.a - x.a || x.h - y.h);
  console.log(`\n  mined against ${H.length} human and ${A.length} AI documents`);
  console.log(`  bar: upstream lift >= ${MINE_MIN_LIFT}, at most ${MINE_MAX_HUMAN * 100}% of human documents, at least ${MINE_MIN_AI * 100}% of AI`);
  for (const r of rows) console.log(`    ${String(r.a).padStart(2)}/${A.length} ai   ${String(r.h).padStart(2)}/${H.length} human   ${r.lift.toFixed(0).padStart(3)}x  ${r.w}`);
  console.log(`  ${rows.length} candidates. Read them before promoting any into ai-tells.`);
  if (rows.length) {
    console.log(`\n  pattern: \\b(?:${rows.map((r) => esc(r.w)).join('|')})\\b`);
  }
}

const days = Number(arg('--days', 28));
const snaps = await snapshots(days);
const seen = new Map();
for (const s of snaps) for (const w of new Set(s.words)) seen.set(w, (seen.get(w) || 0) + 1);
// Keep upstream's own order, taken from the newest snapshot that has the word,
// so the list reads most-characteristic-first the way their page shows it.
const rank = new Map();
for (const s of snaps) s.words.forEach((w, i) => { if (!rank.has(w)) rank.set(w, i); });
const pooled = [...seen].filter(([, n]) => n >= Math.min(MIN_SNAPSHOTS, snaps.length))
  .map(([w]) => w).sort((a, b) => rank.get(a) - rank.get(b));

const mineDir = arg('--mine', null);
if (mineDir) {
  const LIFT = new Map();
  for (const s of snaps) s.words.forEach((w, i) => { if (!LIFT.has(w)) LIFT.set(w, s.lift[i]); });
  await mine(mineDir, pooled, LIFT);
  process.exit(0);
}

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
