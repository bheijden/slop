#!/usr/bin/env node
// Rule test runner.
//
//   node tests/run.mjs                 every built-in rule set
//   node tests/run.mjs rules/mine.json a rule set you are writing
//   node tests/run.mjs --rule no-chain  one rule
//   node tests/run.mjs -v               show every failing variant
//
// Two phases per rule:
//   conformance -- tests.hit must match, tests.miss must not, on plain text
//   fudging     -- every hit example is re-tested through markdown and HTML
//                  markup; lossless markup must not turn a HIT into a MISS

import process from 'node:process';
import { loadBuiltinSets, loadSetFile, findConfig, loadConfig } from '../js/config.mjs';
import { extractMarkdown, extractHtml } from '../js/extract.mjs';
import { variants } from '../js/fudge.mjs';

const EXTRACT = { md: extractMarkdown, html: extractHtml };

export default function main(argv = []) {
const verbose = argv.includes('-v') || argv.includes('--verbose');
const ruleFilter = argv.includes('--rule') ? argv[argv.indexOf('--rule') + 1] : null;
const files = argv.filter((a) => a.endsWith('.json'));

let sets;
try {
  if (files.length) {
    sets = files.map(loadSetFile);
  } else {
    // Your own rule sets get the same tests as the built-in ones, so
    // `slop fudge` covers everything the linter would actually run.
    const cfg = loadConfig(findConfig());
    const local = (cfg.ruleSets || []).filter((r) => !/^https?:\/\//i.test(r));
    sets = [...loadBuiltinSets(), ...local.map(loadSetFile)];
  }
} catch (err) {
  process.stderr.write(`slop: ${err.message}\n`);
  return 2;
}

let conformOk = 0;
let conformBad = 0;
let fudgeOk = 0;
let fudgeBad = 0;
let lossyMiss = 0;
const failures = [];
const fragile = new Map();

for (const set of sets) {
  for (const rule of set.rules) {
    if (ruleFilter && rule.id !== ruleFilter) continue;
    const t = rule.tests || { hit: [], miss: [] };
    if (!t.hit.length) {
      failures.push([rule.id, 'no examples', 'every rule needs at least one tests.hit example']);
      conformBad++;
    }

    for (const ex of t.miss || []) {
      if (rule.find(ex).length === 0) conformOk++;
      else { conformBad++; failures.push([rule.id, 'false positive', JSON.stringify(ex)]); }
    }

    for (const ex of t.hit || []) {
      const hits = rule.find(ex);
      if (!hits.length) {
        conformBad++;
        failures.push([rule.id, 'example does not match', JSON.stringify(ex)]);
        continue;
      }
      conformOk++;
      const { start, end } = hits[0];
      for (const v of variants(ex, start, end)) {
        const { text } = EXTRACT[v.format](v.source, {});
        const still = rule.find(text).length > 0;
        if (still) { if (v.lossless) fudgeOk++; }
        else if (!v.lossless) lossyMiss++;
        else {
          fudgeBad++;
          fragile.set(v.name, (fragile.get(v.name) || 0) + 1);
          failures.push([rule.id, `fragile: ${v.name}`, JSON.stringify(v.source.slice(0, 72))]);
        }
      }
    }
  }
}

const n = sets.reduce((a, s) => a + s.rules.length, 0);
console.log(`rule sets: ${sets.map((s) => s.name).join(', ')}  (${n} rules)`);
console.log(`conformance: ${conformOk} pass, ${conformBad} fail`);
console.log(`fudging:     ${fudgeOk} pass, ${fudgeBad} fail  (${lossyMiss} expected misses on lossy markup)`);

if (fragile.size) {
  console.log('\nfragile variants, worst first:');
  for (const [name, c] of [...fragile].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(c).padStart(4)}  ${name}`);
  }
}
if (failures.length) {
  console.log('\nfailures:');
  const show = verbose ? failures : failures.slice(0, 15);
  for (const [id, why, detail] of show) console.log(`  ${id.padEnd(22)} ${why.padEnd(28)} ${detail}`);
  if (!verbose && failures.length > show.length) {
    console.log(`  ... ${failures.length - show.length} more (-v for all)`);
  }
}
return conformBad + fudgeBad ? 1 : 0;
}

// Run directly: `node tests/run.mjs [set.json] [-v] [--rule id]`
if (import.meta.filename === process.argv[1]) process.exitCode = main(process.argv.slice(2));
