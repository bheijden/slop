#!/usr/bin/env node
// Does candidates/mckinsey.json behave the way the guide it came from intends?
//
// Every other check on that set is circular. Its hit/miss examples were written
// by whoever wrote the rules; so was the "deliberately awful memo" it scores
// 46 on, which was assembled by walking the banned lists. Passing those proves
// the rules do what their author meant, not that their author read the guide
// correctly.
//
// The guide contains the one piece of ground truth nobody here wrote: 26 worked
// examples, each labelled by its own author as good or bad. A rule set that
// captures the spirit of the guide fires on the bad ones and stays quiet on the
// good ones. That is what this measures.
//
// It is a small sample and a stiff test -- most of the bad examples are one
// short sentence, which is where a rate-based rule is blind. When this was
// first run it scored 5 of 11, and the diagnosis (three of the misses were
// gated by document length rather than missing patterns) is why the set now has
// tight-agentless-passive and why tight-empty-modifier reports per occurrence.
//
// Two bad examples are expected to be missed and are recorded below. Both are
// the action-title test -- "Market overview" against "Software valuations have
// returned to 2015 levels" -- which needs the extractor to preserve headings.
// No pattern can reach it, so this test asserts the count rather than pretending
// otherwise. If heading spans ever land, that number should go up, not stay put.
import { readFileSync } from 'node:fs';
import { analyze, compileRule } from '../js/engine.mjs';

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const set = JSON.parse(readFileSync(join(ROOT, 'candidates/mckinsey.json'), 'utf8'));
const rules = set.rules.map((r) => compileRule(r, 'mckinsey'));
const fire = (t) => { const out = []; for (const r of rules) { try { if (analyze(t, [r]).length) out.push(r.id); } catch {} } return out; };

// [guide line, verdict the AUTHOR gave it, text]
const PAIRS = [
  [41,  'bad',  'Current demand dynamics suggest that a pricing adjustment may be warranted.'],
  [37,  'good', 'We should cut prices. Demand is weaker than expected.'],
  [53,  'bad',  'The deterioration in underlying demand dynamics has created a need to reassess the existing pricing architecture.'],
  [57,  'good', 'Demand has weakened faster than expected, making current prices hard to sustain.'],
  [80,  'bad',  'The company has a significant market opportunity.'],
  [84,  'good', 'The addressable market is $14 billion and growing 8% a year.'],
  [106, 'bad',  'The analysis highlights two primary considerations that suggest the current approach may need to be revisited.'],
  [102, 'good', "I don't think this works. We have two problems."],
  [330, 'bad',  'A 15% decline in revenue was observed.'],
  [326, 'good', 'Revenue declined 15%.'],
  [350, 'bad',  'It could potentially be argued that valuations may be somewhat depressed.'],
  [354, 'good', 'Valuations are depressed.'],
  [245, 'bad',  'Market overview'],
  [249, 'good', 'Software valuations have returned to 2015 levels'],
  [253, 'good', 'Lower software valuations have reopened an attractive entry window'],
  [519, 'bad',  'Wait times overview'],
  [523, 'good', 'Headliner waits averaged 57 minutes in July, constraining weekend throughput'],
  [338, 'bad',  'The data provides support for the thesis.'],
  [339, 'bad',  'The change involves the need for consultation.'],
  [340, 'bad',  'We will implement a reduction in headcount.'],
  [63,  'good', 'Revenue fell 15%.'],
  [64,  'good', 'The team missed the deadline.'],
  [65,  'good', 'We should stop the pilot.'],
  [139, 'good', 'We should cut prices. Demand is weaker than expected.'],
  [163, 'good', 'Demand has weakened faster than expected, making current prices hard to sustain. We should cut prices before volume falls further.'],
  [190, 'good', 'Demand has weakened faster than expected, making the current pricing model unsustainable. Two factors explain the change: category demand has fallen, and competitors have cut prices. We should reset pricing now rather than protect margin at the expense of volume.'],
];

let caught = 0, missed = 0, quiet = 0, falseAlarm = 0;
const missedList = [], alarmList = [];
console.log('THE GUIDE\'S OWN EXAMPLES, run through the rule set\n');
for (const [line, verdict, text] of PAIRS) {
  const hits = fire(text);
  const words = text.split(/\s+/).length;
  const ok = verdict === 'bad' ? hits.length > 0 : hits.length === 0;
  if (verdict === 'bad') { hits.length ? caught++ : (missed++, missedList.push([line, text, words])); }
  else { hits.length ? (falseAlarm++, alarmList.push([line, text, hits])) : quiet++; }
  const mark = ok ? ' ok ' : 'MISS';
  console.log(`  ${mark}  L${String(line).padStart(3)}  ${verdict.padEnd(4)} ${String(words).padStart(2)}w  ${hits.join(' ') || '— nothing fires'}`);
  console.log(`              ${JSON.stringify(text.slice(0, 88))}`);
}
const bad = caught + missed, good = quiet + falseAlarm;
console.log(`\n\nBAD examples caught:   ${caught}/${bad}`);
console.log(`GOOD examples silent:  ${quiet}/${good}`);
if (missedList.length) {
  console.log(`\nThe author's own bad examples that this set does NOT flag:`);
  for (const [l, t, w] of missedList) console.log(`  L${l} (${w} words)  ${JSON.stringify(t.slice(0, 84))}`);
}
if (alarmList.length) {
  console.log(`\nGood examples that fired anyway:`);
  for (const [l, t, h] of alarmList) console.log(`  L${l}  ${h.join(' ')}  ${JSON.stringify(t.slice(0, 70))}`);
}

// The bar is the score this reached once the length-gated misses were fixed.
// Dropping below it means a change broke the set's agreement with its own guide.
const FLOOR_CAUGHT = 9, FLOOR_QUIET = 15;
let bad_ = 0;
if (caught < FLOOR_CAUGHT) { console.log(`\nFAIL: caught ${caught}, expected at least ${FLOOR_CAUGHT}`); bad_++; }
if (quiet < FLOOR_QUIET) { console.log(`\nFAIL: ${good - quiet} of the author's good examples fired`); bad_++; }
console.log(bad_ ? '\nmckinsey spirit: FAILED' : "\nmckinsey spirit: holds (9/11 bad caught, 15/15 good silent; the 2 misses are action titles)");
process.exit(bad_ ? 1 : 0);
