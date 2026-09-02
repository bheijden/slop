# The derived vocabulary

Most of what slop ships is fixed. Someone read a source, wrote a rule, and it
stays put. One rule set works differently. `ai-vocabulary` is measured
from public GitHub pull request descriptions every morning, and its words move
as the writing moves.

[The page](https://bheijden.github.io/slop/web/vocabulary.html) shows what it
currently says, how it got there, and what each word has done over time.

## Why pull requests

They are the only large body of public text that refreshes daily, is written by
people doing everyday work, and where a growing share is machine-written **and
labels the fact**. Claude Code, Codex, Cursor, Gemini, Devin and others sign the body
they generate. The signature is a label no one has to work out.

## The five steps

**1. Sample.** Ten windows of five minutes a day, one from each 2.4 hour block, with start times taken from the date so any day can be re-collected to the second.
About a thousand descriptions a day.

**2. Split off the signature.** Tools sign in two shapes: a trailing line whose
grammar is attribution ("Generated with", "Co-authored-by"), or an HTML comment
carrying a shouted sentinel, which is how Cursor signs. Both are matched on form,
not on product name, and both leave the text before any word is tallied.

**3. Label.** The signature by itself decides the group.
Everything else from that same day is the control.

**4. Count, then discard.** Each day becomes one gzipped file of word counts in
`data/counts/` and the text is thrown away. Counts are per day, not merged into a
running total, so a word's history stays readable and any window can be rebuilt.

**5. Divide.** A word's score is its frequency in signed descriptions over its frequency
in unsigned ones from the same days.

## Why the comparison is same-day

A word that turns up because the world changed shows on both parts of one
day and cancels. `mcp`, `ruff` and `typecheck` are common in 2026 and missing from
2022, so comparing 2022 against now ranks them at the top; comparing signed
against unsigned on one day does not. Only a difference between the two kinds of author
remains.

## What is hardcoded, and what is not

Which tools exist is the one fact that goes stale by itself, so it is
discovered. `tools/pr-markers.mjs` looks for attribution-shaped lines that
`data/markers.json` does not know, and proposes them through a pull request
that is redone weekly, so a candidate that turns out to be a fluke disappears
before it is merged. Nothing is added automatically.

Everything else is a stated number, written where it is used:

| | | |
|---|---|---|
| `MIN_UNMARKED` | 100 | control descriptions a word needs before its ratio carries weight |
| `MIN_AUTHORS` | 15 | accounts that must have used it, so a single person cannot invent one |
| `ENGLISH_MIN` | 0.12 | share of function words for a description to count as English prose |
| `TOKENS_MIN` | 25 | below this a description is a stub |
| letters per word | 3 | below this the list fills with `375px` and `a2` |

A number you can read and argue with is better than a formula that hides one. A
confidence interval was tried in place of `MIN_UNMARKED` and did less well, so
it was dropped.

## What it will not tell you

**The control is not human.** Plenty of machine-written descriptions carry no
signature. That makes the two groups more alike, so every score is an underestimate.

**This is software prose.** Words like `round-trip` rank high partly because
this is pull request text. The same-day split means it is a real difference
between the two authors, but whether the ratio carries over to an essay has not been tested.

**A signed description is one tool's users.** People who leave the footer in place are
not a random sample of everyone writing with a machine.

## Running it

```sh
node tools/pr-count.mjs 2026-09-01           # count one day
node tools/pr-count.mjs 2025-01-01..2026-09-01   # backfill a range
node tools/pr-build.mjs --write              # rebuild the rule from the counts
node tools/pr-page-data.mjs                  # rebuild what the page reads
node tools/pr-markers.mjs --days 21          # look for unrecognised signatures
node tools/pr-cluster.mjs --days 40          # the co-occurrence view
```

`tools/pr-cluster.mjs` is the one piece borrowed whole from
[load-bearing](https://github.com/louisabraham/load-bearing). Their k-means
finds words that travel together, which a per-word ratio cannot see. Two of its
starting points come from the signed and unsigned averages, and the cluster it
reports is the one with the highest signed share, not the one that rose. On a recent
window it separates 37.9% signed from 1.8%, and its words agree with their list 74%
of the time in the top fifty.

The first 20 months of samples come from their archive, which is why this could
start with 609 days of history and not one.
