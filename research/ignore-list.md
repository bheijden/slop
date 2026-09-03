# Is there an ignore list worth writing?

The derived list holds 250 ordinary words, and some of them look like they
could not possibly be tells — `ten`, `half`, `twelve`, `nine`, `said`, `told`.
The question is whether removing such words by hand would make the rule better,
particularly on short documents where every spurious match moves the rate.

Everything here measures against `data/corpus`: 24 matched pairs of general
prose, human and machine, on the same topics. The list is derived from GitHub
pull request descriptions and the derivation has never seen this corpus, so a
word's behaviour here is an out-of-sample check.

The rule counts **distinct** list words per document, so what decides a word's
contribution is how many documents it turns up in, not how often. Document
frequency on each side is what is measured throughout.

```sh
node tools/word-audit.mjs      # every word, one at a time
node tools/word-ablate.mjs     # remove groups and re-score
```

## The counting words are among the best tells in the list

| word | machine | human | lift |
|---|---|---|---|
| ten | 7/24 | 1/24 | 4.00 |
| nine | 2/24 | 0/24 | 3.00 |
| half | 9/24 | 4/24 | 2.00 |
| twelve | 3/24 | 1/24 | 2.00 |
| sides | 3/24 | 1/24 | 2.00 |
| eleven | 1/24 | 0/24 | 2.00 |
| fifth | 2/24 | 1/24 | 1.50 |
| halves, fourth | 0/24 | 0/24 | — |

Not one of them leans human. `ten` is in the top fifteen tells in the whole
list, above `apart` and `reaches`. Removing all nine costs accuracy at nearly
every document length:

| | full | 900w | 600w | 400w | 300w |
|---|---|---|---|---|---|
| shipped | 22/24 | 21/24 | 16/24 | 17/24 | 13/24 |
| minus the counting words | 21/24 | 20/24 | 16/24 | 15/24 | 12/24 |

This is the one comparison on this page that is honest without qualification,
because the group was chosen in advance from a hunch rather than by looking at
the corpus. The hunch was wrong, and the alternative reading offered alongside
it — that machines reach for enumeration where people would write "a lot" or
"a while" — is what the numbers support.

## There is almost nothing to remove

Of the 250 words, 136 appear somewhere in the corpus. Of those 136:

- 108 lean machine (lift above 1.2)
- 13 are flat (0.83 to 1.2)
- 15 lean human (below 0.83)

Fifteen candidates out of 250. And most of that fifteen is noise. Splitting the
pairs four ways and picking the ignore list on three quarters at a time, only
**three** words are flagged in all four folds:

| word | machine | human |
|---|---|---|
| says | 1/24 | 4/24 |
| hands | 0/24 | 2/24 |
| proven | 0/24 | 2/24 |

Twenty-one words are flagged in at least one fold; six are flagged in exactly
one. Three words resting on two to four documents each is not a pattern.

## An honestly-chosen ignore list buys nothing

Picking the list on three quarters of the pairs and scoring on the quarter held
out, rotating through all four:

| | caught |
|---|---|
| shipped list | 23/24 |
| with the fold's ignore list applied | 23/24 |

Identical. The naive version looks much better — dropping the 15 human-leaning
words takes the full-length score from 22/24 to 23/24, and the 600-word score
from 16/24 to 22/24 — but those 15 were chosen by measuring lift on the same 48
documents the score is then computed on. That gain is the corpus being fitted,
not a better rule.

## Short documents are a different problem

Truncating every document and re-scoring the shipped list:

| length | full | 900w | 600w | 400w | 300w | 200w |
|---|---|---|---|---|---|---|
| caught | 22/24 | 21/24 | 16/24 | 17/24 | 13/24 | 8/24 |

The decline is real, and the rule's `needs: { words: 600 }` is why short
documents are refused rather than guessed at. But no filtering fixes it: the
ignore-list variants fall off at the same rate. Distinct-words-over-root-length
simply has less to find in 300 words, and the lever for short text is a
different statistic or a length-aware threshold, not a shorter word list.

## What the corpus cannot see

114 of the 250 words appear in none of the 48 documents. They are pull-request
vocabulary — `byte-identical`, `dedup`, `mutation-checked`, `unit-tested`,
`pre-fix`, `--noemit`-adjacent debris. Dropping them changes no number here,
necessarily, because they never fire.

Their real risk is different: firing on human-written engineering prose, which
is what this linter is pointed at. The corpus tests that weakly — 3 of the 24
pairs are technical documentation — and on those three the human documents hit
2, 2 and 5 of the 250 words. Low, but measured on three documents.

## The example on the check page overstates the problem

The example was written to make the rule fire, so it is not evidence about
natural prose. It runs 655 words, matches 25 distinct list words and scores
0.98 against a 0.40 threshold. Thirteen of those 25 come from the top 60 of the
list, because that is where they were picked from. Four are counting words.
Anyone reading it and concluding the list is full of ordinary words is reading
a document built from the top of the list.

## The reading

No ignore list, on this evidence. The three stable candidates are worth three
documents of signal between them, and hand-removing anything else means
removing words like `ten` that the corpus says are working.

The limit here is the corpus. Twenty-four pairs can resolve "the counting words
are tells" and "there is no large ignore list", and cannot resolve whether a
three-word one helps. If this question matters, the answer is a bigger corpus,
not a longer argument — at a hundred pairs the cross-validation above would
have the power to detect a real ignore list if one exists.
