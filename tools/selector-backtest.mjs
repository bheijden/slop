#!/usr/bin/env node
// Which cluster should have been published, and which rule would have picked it.
//
// Takes the dumps written by `pr-cluster.mjs --dump` -- every cluster's stats
// and word list from one fit -- and for each fit reports:
//
//   truth     the cluster whose words actually separate machine from human
//             writing on data/corpus, which is the thing we are trying to find
//   signature the one with the largest share of signed descriptions (ours)
//   growth    the largest of recent weeks among those that rose from under 2%
//             to over 20% (upstream's)
//   gap       how far the top signature share is above the runner-up
//
// The corpus is a stopgap and says so: it is 24 pairs written once, and the
// machine half ages as models change. It cannot be the selector, only a way of
// asking whether a selector was right on the days we can still check.
//
//   node tools/selector-backtest.mjs /tmp/ksweep/k*.json

import { readFileSync } from 'node:fs';
import { loadCorpus } from '../js/corpus.mjs';

const files = process.argv.slice(2).filter((a) => a.endsWith('.json'));
if (!files.length) { console.error('usage: selector-backtest.mjs <dump.json>...'); process.exit(2); }

const { human, ai } = loadCorpus();
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The same measure the rule uses: how many DIFFERENT list words a document
// reaches for, over its length raised to the shipped exponent.
function catches(words, power = 0.7, budget = 1) {
  const re = new RegExp(`\\b(?:${words.map(esc).join('|')})\\b`, 'gi');
  const of = (d) => new Set((d.text.match(re) || []).map((w) => w.toLowerCase())).size
                  / Math.pow(d.words, power);
  const h = human.map(of).sort((a, b) => b - a);
  const t = h[budget] + 1e-9;
  return ai.map(of).filter((x) => x >= t).length;
}

const pct = (v) => `${(100 * v).toFixed(1)}%`;

for (const f of files) {
  const fit = JSON.parse(readFileSync(f, 'utf8'));
  const cs = fit.clusters;

  const scored = cs.map((c) => ({ ...c, caught: catches(c.words) }));
  const truth = scored.reduce((b, x) => (x.caught > b.caught ? x : b));
  const signature = cs.reduce((b, x) => (x.stamped > b.stamped ? x : b));
  const grew = cs.filter((x) => x.arrived);
  const growth = grew.length ? grew.reduce((b, x) => (x.end > b.end ? x : b)) : null;
  const runnerUp = cs.filter((x) => x !== signature)
    .reduce((b, x) => (!b || x.stamped > b.stamped ? x : b), null);
  const gap = runnerUp ? signature.stamped - runnerUp.stamped : 1;

  const name = (c) => (c ? `stack ${c.stack} (${pct(c.stamped)} signed, ${c.caught ?? '?'}/24)` : 'none');
  console.log(`\n${f.split('/').pop()}  k=${fit.k}  ${fit.days} days to ${fit.to}`);
  console.log(`  best available   ${name(truth)}  "${truth.words.slice(0, 6).join(' ')}"`);
  console.log(`  signature picks  ${name(scored.find((x) => x.stack === signature.stack))}`
    + `${signature.stack === truth.stack ? '  RIGHT' : '  WRONG'}   gap to runner-up ${pct(gap)}`);
  console.log(`  growth picks     ${name(growth && scored.find((x) => x.stack === growth.stack))}`
    + `${growth && growth.stack === truth.stack ? '  RIGHT' : '  WRONG'}`
    + `   (${grew.length} admitted)`);
}
