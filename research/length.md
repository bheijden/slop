# The operating point, and the exponent under it

Two questions about how the derived vocabulary rule is configured. Both are
settled the same way: choose the setting on part of the corpus, score it on the
part held out. Reading the best number off all 48 documents answers neither.

```sh
node tools/metric-sweep.mjs
```

## Why not 200 words at 0.31?

`tools/score-list.mjs` reports the best operating point it can find on the
corpus: the top 200 words at a threshold of 0.31, catching 22 of 24. The rule
ships all 250 at 0.40 and catches 20. The gap looks like two free documents.

It is not, for two reasons.

**The optimum does not replicate.** Choosing both the list length and the
threshold on three quarters of the pairs, each fold picks something different,
and no fold picks 200 at 0.31:

| fold | chose |
|---|---|
| 1 | 100 words @ 0.13 |
| 2 | 100 words @ 0.18 |
| 3 | 150 words @ 0.24 |
| 4 | 150 words @ 0.24 |

**And the winning is worth one document, not two.** Scored on the quarter each
fold never saw:

| | caught |
|---|---|
| tuned per fold | 21/24 |
| shipped, 250 @ 0.40 | 20/24 |

Two knobs fitted on 48 documents produce a number that looks two documents
better and is one, on settings that change every time the documents change.
There is a hint in the folds worth following up — all four preferred a list
shorter than 250 — but 200 @ 0.31 is a draw from a noisy distribution, not a
discovery.

A correction to an earlier claim: the shipped threshold was defended as sitting
"further from the human distribution", buying margin. Measured, it does not.
The gap between threshold and the highest-scoring human document is -0.28 human
standard deviations for the shipped point and -0.31 for the tuned one. Both sit
just below the top human document, which is why both allow one false alarm.
They are the same shape. The real argument for 250 @ 0.40 is only that it is
not fitted, which is enough, and the margin claim was wrong.

## The exponent is worth more than the operating point

`power` divides a distinct-word count by the length raised to that power, and
it ships at 0.5, the square root. The exponent that belongs there is whatever
makes **one threshold mean the same thing on a short document and a long
one**. That is directly testable:
calibrate the threshold on full-length documents, then apply it unchanged as
the documents are truncated. Too low an exponent and long documents drift above
the line; too high and short ones do.

Threshold calibrated at one false alarm on full-length human documents, then
held fixed. `fa` is human documents falsely flagged at that length:

| exponent | full | 900w | 600w | 400w | 300w |
|---|---|---|---|---|---|
| 0.4 | 1fa 22/24 | 1fa 21/24 | 2fa 18/24 | 1fa 9/24 | 1fa 8/24 |
| **0.5** (ships) | 1fa 22/24 | 1fa 21/24 | 2fa 18/24 | 1fa 14/24 | 1fa 12/24 |
| 0.6 | 1fa 22/24 | 1fa 21/24 | 2fa 18/24 | 1fa 14/24 | 1fa 12/24 |
| **0.7** | 1fa 22/24 | 1fa 21/24 | 2fa 20/24 | 1fa 17/24 | 1fa 13/24 |
| 0.8 | 1fa 22/24 | 1fa 21/24 | 2fa 20/24 | 1fa 17/24 | 1fa 13/24 |
| 0.9 | 1fa 22/24 | 1fa 21/24 | 2fa 20/24 | 1fa 17/24 | 6fa 17/24 |
| 1.0 | 1fa 20/24 | 1fa 21/24 | 2fa 20/24 | 4fa 20/24 | 6fa 17/24 |

0.9 and 1.0 buy their extra catches by losing false-alarm control on short
documents, which is not a trade. Below 0.7 the metric simply falls apart as
documents shorten.

Unlike the operating point, this choice **replicates**. Choosing the exponent
on three quarters of the pairs and scoring on the quarter held out:

| at | folds chose | chosen, held out | square root, held out |
|---|---|---|---|
| 400 words | 0.7, 0.7, 0.7, 0.7 | **17/24** | 14/24 |
| 600 words | 0.9, 0.7, 0.6, 0.9 | **21/24** | 18/24 |

Four folds out of four agree at 400 words, and the gain is three documents at
both lengths.

## What the exponent does not do

At full length it changes nothing about separability. The number of machine
documents scoring above the highest-scoring human document is **18 of 24 at
both 0.5 and 0.7**. Whatever the exponent, the same six documents are
inseparable from human writing at zero false alarms.

So the exponent is not a better detector. It is a better *ruler*: it makes one
threshold portable across lengths. All of its value is on documents shorter
than the corpus, and none of it is at full length.

## What was adopted

`js/engine.mjs` takes `power`, the exponent the count is divided by. It
replaced `per: "root"`, which was the same thing named twice. Switching the
derived rule is one number plus a recalibrated threshold:

```json
"notable": { ">=": 0.095, "power": 0.7, "unit": "words",
             "needs": { "words": 600, "sentences": 5, "matches": 10 } }
```

**0.7 is what ships**, as of this note. Not 0.8, which scores identically on
every length measured but sits one step from 0.9, where false-alarm control
fails at 300 words. 0.7 is the lowest exponent that gets the full gain and the
only one all four folds agree on.

Measured against what ships today:

| | full length | truncated to 600 words |
|---|---|---|
| 0.5 @ 0.40 (ships) | 1 false alarm, 20/24 | 1 false alarm, 16/24 |
| 0.7 @ 0.095 | 1 false alarm, 22/24 | 2 false alarms, 18/24 |

Two more at full length and two more at the floor, for one more false alarm at
the floor. A real trade rather than a free win, and it was taken deliberately.

`needs.words` stays at 600. The exponent makes shorter documents *scoreable*
— at 400 words it catches 17 of 24 against the square root's 14 — but lowering
the floor is a separate decision resting on the same truncated evidence, so it
has not been made.

## The ported list wanted the same exponent and a different threshold

`rules/load-bearing.json` was measured separately, because the exponent is a
property of the pattern and that list is 1,198 words against this one's 250.
Run `node tools/metric-sweep.mjs rules/load-bearing.json`.

It lands on 0.7 as well — four folds out of four at 400 words — and the gain is
larger, because a longer list saturates sooner and so suffers more from being
divided by too small a power. Held out at 400 words it catches 22 of 24 against
the square root's 14.

Where the two rules part company is the threshold. Above the highest-scoring
human document, load-bearing's populations leave a gap: the top human scores
0.305 and the lowest machine document above it scores 0.318. A threshold of
0.31 sits in that gap, so it costs **no false alarms at all**:

| | full | 600w | 400w |
|---|---|---|---|
| 0.5 @ 1.20 (before) | 1 false alarm, 22/24 | 1 false alarm, 16/24 | 10/24 |
| **0.7 @ 0.31** | **0 false alarms, 22/24** | **0, 21/24** | **0, 20/24** |

Better on every axis, which is why it was applied without the deliberation the
derived rule needed. The derived list has no such gap — buying zero false
alarms there costs four documents — so the two rules carry different thresholds
for a measured reason rather than an oversight.

Only our layer changed. The 1,198 words are still upstream's, rebuilt from
upstream by `tools/load-bearing.mjs`, which rewrites the pattern and leaves
`notable` alone. Their method publishes a word list and no per-document rate;
the metric that turns a list into a rule has always been ours.

**The caveat that matters.** Every short-document number above comes from
truncating a long document. A 400-word slice of a 1,000-word essay has an
introduction and no conclusion, and its vocabulary is not necessarily
distributed like a natively 400-word piece. The exponent's advantage is
measured on documents nobody actually wrote. Confirming it needs short
documents in `data/corpus`, which currently holds none: the shortest is 615
words.
