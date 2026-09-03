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

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { loadCorpus } from '../js/corpus.mjs';
import { resolveRules } from '../js/config.mjs';

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

console.log(failed ? `\ndocumented claims: ${failed} failed` : '\ndocumented claims: all hold');
process.exit(failed ? 1 : 0);
