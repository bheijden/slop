#!/usr/bin/env node
// Checks the numbers the documentation states about the derived rule against
// what the rule actually does.
//
// docs/vocabulary.md said the rule flags 0 of 24 human documents and 22 of 24
// machine-written ones. The engine flagged 1 and 20. The 22 was real, but it
// came from tools/score-list.mjs, which tunes BOTH the list length and the
// threshold to find the best available operating point -- there it is the top
// 200 words at 0.31. The shipped rule uses all 250 at 0.40. Two different
// configurations, one number, and the doc quoted the wrong one.
//
// The list re-derives every Monday, so any figure written by hand here goes
// stale on its own. This makes that a failing test rather than a thing someone
// notices a month later.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { loadCorpus } from '../js/corpus.mjs';
import { resolveRules } from '../js/config.mjs';
import { compileRule } from '../js/engine.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}   ${name}${ok || !detail ? '' : `  — ${detail}`}`);
  if (!ok) failed++;
};

const { human, ai } = loadCorpus();
const { rules } = resolveRules({ select: ['pr-vocabulary'] });
const rule = rules.find((r) => r.id === 'pr-vocabulary');
const flags = (d) => rule.fires(d.text);
const H = human.filter(flags).length;
const A = ai.filter(flags).length;

console.log(`the derived rule as it ships: ${H}/${human.length} human, ${A}/${ai.length} machine`);

// The claim, wherever it is written, has to be the shipped configuration's.
const doc = readFileSync(join(ROOT, 'docs/vocabulary.md'), 'utf8');
const m = /flags \*\*(\d+) of the (\d+) human documents and\s*\n?(\d+) of the (\d+) machine-written ones/.exec(doc);
check('docs/vocabulary.md states a score for the shipped rule', !!m,
  'the sentence naming the two counts was not found');
if (m) {
  check('the stated human count is what the rule does',
    Number(m[1]) === H && Number(m[2]) === human.length, `doc says ${m[1]}/${m[2]}, rule gives ${H}/${human.length}`);
  check('the stated machine count is what the rule does',
    Number(m[3]) === A && Number(m[4]) === ai.length, `doc says ${m[3]}/${m[4]}, rule gives ${A}/${ai.length}`);
}

// A false-alarm rate above this is not a linter anyone would leave switched on.
check('the rule stays inside its false-alarm budget', H <= 1, `${H} of ${human.length} human documents flagged`);

// `power` is the exponent a distinct count is divided by. It replaced
// per: "root", which was the same thing named twice -- a root IS a power.
// 50 matches in 100 words: at 0.5 that is 50/10 = 5, at 1.0 it is 50/100 = 0.5.
// One threshold of 4 separates the two.
const mk = (notable) => compileRule({
  id: 'p', name: 'p', match: { kind: 'regex', pattern: '\\bthe\\b', flags: 'gi' },
  notable: { ...notable, needs: { words: 0, sentences: 0, matches: 0 } },
  description: 'x', suggest: 'x', tests: { hit: [], miss: [] },
}, 'test');
const sample = `${'the '.repeat(50)}${'word '.repeat(50)}`;
const refuses = (notable) => { try { mk(notable); return false; } catch { return true; } };

check('power 0.5 is the square root',
  mk({ '>=': 4, power: 0.5 }).fires(sample) && !mk({ '>=': 6, power: 0.5 }).fires(sample));
check('a higher exponent lowers the value',
  !mk({ '>=': 4, power: 1 }).fires(sample) && mk({ '>=': 0.4, power: 1 }).fires(sample));
check('an exponent outside (0, 1] is refused', refuses({ '>=': 1, power: 0 }));
check('per: "root" is refused rather than guessed at', refuses({ '>=': 1, per: 'root' }));
check('per and power together are refused', refuses({ '>=': 1, per: 1000, power: 0.5 }));
// No rule may carry the old spelling, including any added since.
const stale = [];
for (const dir of ['rules', 'candidates']) {
  for (const f of readdirSync(join(ROOT, dir))) {
    if (!f.endsWith('.json') || f === 'index.json') continue;
    const s2 = JSON.parse(readFileSync(join(ROOT, dir, f), 'utf8'));
    for (const r of s2.rules || []) if (r.notable?.per === 'root') stale.push(`${f}:${r.id}`);
  }
}
check('no shipped rule still says per: "root"', stale.length === 0, stale.join(' '));

// The exponent is a measured choice, not a default. pr-cluster rewrites this
// rule's pattern every Monday and must leave its arithmetic alone.
const shipped = JSON.parse(readFileSync(join(ROOT, 'rules/pr-vocabulary.json'), 'utf8'));
const n = shipped.rules[0].notable;
check('the derived rule keeps the exponent research/length.md chose',
  n.power === 0.7, `power is ${n.power}`);
check('and the threshold calibrated for it', n['>='] === 0.095, `threshold is ${n['>=']}`);

console.log(failed ? `\ndocumented claims: ${failed} failed` : '\ndocumented claims: all hold');
process.exit(failed ? 1 : 0);
