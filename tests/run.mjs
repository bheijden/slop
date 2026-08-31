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
import { readFileSync } from 'node:fs';
import { loadBuiltinSets, loadLibrarySets, loadSetFile, findConfig, loadConfig } from '../js/config.mjs';
import { extractMarkdown, extractHtml } from '../js/extract.mjs';
import { testRules, failureHelp } from '../js/fudge.mjs';

const EXTRACT = { md: extractMarkdown, html: extractHtml };

export default function main(argv = []) {
const verbose = argv.includes('-v') || argv.includes('--verbose');
const ruleFilter = argv.includes('--rule') ? argv[argv.indexOf('--rule') + 1] : null;
const files = argv.filter((a) => a.endsWith('.json'));

let sets;
try {
  if (files.length) {
    // `candidates/*.json` also matches the manifest that lists them, which is
    // not a rule set. Skip anything with a "sets" array and no rules.
    sets = files.map((f) => {
      const raw = JSON.parse(readFileSync(f, 'utf8'));
      return Array.isArray(raw.sets) && !Array.isArray(raw.rules) ? null : loadSetFile(f);
    }).filter(Boolean);
  } else {
    // Your own rule sets get the same tests as the built-in ones, so
    // `slop fudge` covers everything the linter would actually run:
    // what ships here, what `add` installed, and what the config points at.
    const cfg = loadConfig(findConfig());
    const local = (cfg.ruleSets || []).filter((r) => !/^https?:\/\//i.test(r));
    const seen = new Set();
    sets = [...loadBuiltinSets(), ...loadLibrarySets(), ...local.map(loadSetFile)]
      .reverse().filter((x) => !seen.has(x.name) && seen.add(x.name)).reverse();
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
const EXTRACT = { md: extractMarkdown, html: extractHtml };

for (const set of sets) {
  const rules = ruleFilter ? set.rules.filter((r) => r.id === ruleFilter) : set.rules;
  if (!rules.length) continue;
  const t = testRules(rules, EXTRACT);
  conformOk += t.conform.ok; conformBad += t.conform.fail;
  fudgeOk += t.fudge.ok; fudgeBad += t.fudge.fail; lossyMiss += t.fudge.lossy;
  for (const f of t.failures) failures.push([f.rule, f.kind, JSON.stringify(String(f.detail).slice(0, 72))]);
  for (const [k, v] of Object.entries(t.fragile)) fragile.set(k, (fragile.get(k) || 0) + v);
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
  const seen = new Set();
  for (const [id, why, detail] of show) {
    console.log(`  ${id.padEnd(22)} ${why.padEnd(28)} ${detail}`);
    // The guidance is per kind, not per rule, so say it once.
    const help = failureHelp(why);
    if (!seen.has(help)) { seen.add(help); console.log(`  ${' '.repeat(22)} ${help}`); }
  }
  if (!verbose && failures.length > show.length) {
    console.log(`  ... ${failures.length - show.length} more (-v for all)`);
  }
}
return conformBad + fudgeBad ? 1 : 0;
}

// Run directly: `node tests/run.mjs [set.json] [-v] [--rule id]`
if (import.meta.filename === process.argv[1]) process.exitCode = main(process.argv.slice(2));
