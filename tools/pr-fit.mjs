#!/usr/bin/env node
// Chooses how many clusters to cut the archive into, and which cluster to
// publish, by making both selectors agree.
//
// pr-cluster.mjs fits one k and publishes the cluster with the largest share of
// signed descriptions. On 2026-09-07 that picked a front-end styling cluster --
// 39.0% signed against 34.7% for the register -- because front-end work is
// heavily agent-assisted, so its descriptions carry signatures without being a
// way of writing. The rule then failed its own example and nothing was
// published, which is the only reason it was noticed.
//
// Two things went wrong there, and this addresses both.
//
// k was fixed at 10, and 10 was the worst available. On that archive k=8 and
// k=12 both reached 22 of 24 on data/corpus, k=11 reached 21, k=9 reached 19,
// and k=10 reached 16. At 10 the register had split, leaving several
// agent-heavy subject clusters at the same signature level, so which one led
// was close to noise.
//
// And one selector chose alone. There are two, and they are independent:
//
//   signature  the cluster with the largest share of signed descriptions
//   growth     the largest of recent weeks among those that rose from under
//              2% of pull requests to over 20% -- what load-bearing does
//
// Neither is reliable by itself. Signature is fooled by work that is
// agent-assisted without being agent-written; growth is fooled by anything that
// arrived recently for other reasons, and on four earlier fits it admitted two
// candidates every time and picked wrong three times. But they fail for
// unrelated reasons, so a fit where they land on the same cluster is one where
// neither excuse applies. That is the whole of the rule here: sweep k, keep the
// fits where the two agree, and take the one whose signature share is furthest
// clear of its runner-up. Nothing is published from a fit where they disagree.
//
// If no k produces agreement, nothing is written and the list already shipped
// stays. A week without a refresh costs a week of drift; publishing the wrong
// cluster costs the rule.
//
//   node tools/pr-fit.mjs                sweep, report, write nothing
//   node tools/pr-fit.mjs --write        and rebuild the rule from the winner
//   node tools/pr-fit.mjs --ks 8,10,12   a different sweep

import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };
const KS = String(arg('--ks', '8,9,10,11,12')).split(',').map(Number);
const WRITE = process.argv.includes('--write');
const pct = (v) => `${(100 * v).toFixed(1)}%`;

// --keep leaves the per-k dumps for tools/selector-backtest.mjs, which is how
// the choice here gets checked against data/corpus.
const KEEP = arg('--keep', '');
const work = KEEP || mkdtempSync(join(tmpdir(), 'pr-fit-'));
const cluster = (extra, quiet = false) => execFileSync('node',
  ['--max-old-space-size=6000', join(ROOT, 'tools/pr-cluster.mjs'), ...extra],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    // The iteration counter is progress, not output, and five fits of it buries
    // the sweep. A fit that fails still throws.
    stdio: ['ignore', 'pipe', quiet ? 'ignore' : 'inherit'] });

// One fit, read back as data rather than as console output.
function fit(k) {
  const dump = join(work, `k${k}.json`);
  cluster(['--k', String(k), '--dry', '--dump', dump], true);
  return JSON.parse(readFileSync(dump, 'utf8'));
}

// The two selectors, and whether they agree.
function judge(f) {
  const cs = f.clusters;
  const signature = cs.reduce((b, x) => (x.stamped > b.stamped ? x : b));
  const runnerUp = cs.filter((x) => x !== signature)
    .reduce((b, x) => (!b || x.stamped > b.stamped ? x : b), null);
  const grew = cs.filter((x) => x.arrived);
  const growth = grew.length ? grew.reduce((b, x) => (x.end > b.end ? x : b)) : null;
  return {
    k: f.k, signature, growth, admitted: grew.length,
    gap: runnerUp ? signature.stamped - runnerUp.stamped : 1,
    agree: !!growth && growth.label === signature.label,
  };
}

console.log(`sweeping k = ${KS.join(', ')} over the archive\n`);
const judged = [];
for (const k of KS) {
  const j = judge(fit(k));
  judged.push(j);
  console.log(`  k=${String(k).padStart(2)}  signature -> ${pct(j.signature.stamped)} `
    + `"${j.signature.words.slice(0, 4).join(' ')}"`);
  console.log(`        growth    -> ${j.growth ? `${pct(j.growth.end)} of recent weeks, `
    + `"${j.growth.words.slice(0, 4).join(' ')}"` : 'nothing arrived'}`);
  console.log(`        ${j.agree ? 'AGREE' : 'disagree'}   gap to runner-up ${pct(j.gap)}`
    + `   (${j.admitted} admitted)\n`);
}

const agreed = judged.filter((j) => j.agree);
if (!agreed.length) {
  console.error('no k produced agreement between the two selectors; nothing written.');
  console.error('the list already shipped stays. Look at the sweep above before forcing one.');
  if (!KEEP) if (!KEEP) rmSync(work, { recursive: true, force: true });
  process.exit(3);
}

const winner = agreed.reduce((b, j) => (j.gap > b.gap ? j : b));
console.log(`${agreed.length} of ${judged.length} fits agree. Taking k=${winner.k}, `
  + `the widest gap at ${pct(winner.gap)}.`);
console.log(`publishing "${winner.signature.words.slice(0, 8).join(' ')}"`);

if (WRITE) {
  console.log(`\nre-running k=${winner.k} to write the rule and the page data:`);
  process.stdout.write(cluster(['--k', String(winner.k), '--write']));
}
if (!KEEP) rmSync(work, { recursive: true, force: true });
