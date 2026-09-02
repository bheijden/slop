# The derived vocabulary

Most of what slop ships is fixed. Someone read a source, wrote a rule, and it
stays put. One rule set works differently. `ai-vocabulary` is derived from
public GitHub pull request descriptions, and its words move as the writing
moves.

[The page](https://bheijden.github.io/slop/web/vocabulary.html) shows what it
currently says, what the derivation found, and what it threw away.

## Why pull requests

They are the only large body of public text that refreshes daily, is written by
people doing everyday work, and where a growing share is machine-written **and
says so**. Claude Code, Codex, Cursor, Gemini, Devin and others sign the body
they generate. The signature is a label nobody has to work out.

## Two words this page needs

**Register** is a way of writing, as opposed to a thing written about. Academic,
tabloid, legal, chatty are registers; so is the way a machine writes a pull
request description. It is the same sense `data/corpus` uses when it files its
pairs under `academic`, `journalism`, `literary`. Two authors describing the
same lockfile bump in different registers produce different sentences, and a
word list is only about the writing if the subject is held still. Everything
below is an attempt to hold it still.

**Small group** is a cluster from the finer of the two cuts, and nothing more.
The same descriptions are clustered twice: once into five groups, to find the
register, and once into ten, which are only ever used to remove words. The
register is *not* one of the ten — its descriptions scatter, most into one small
group and the rest across three or four others. "One corner of the register"
means one of those scattered pieces.

## What the signature says, and what it does not

A signed description was written by a machine. That is the whole of what the
signature establishes. Three things it does **not** establish, each of which
cost a working method before it was measured:

- **It does not say the unsigned ones are human.** Plenty are machine-written
  with the footer stripped, so the unsigned side is a mixture and every contrast
  against it is diluted.
- **It does not say a group holding more signatures is more machine-sounding.**
  Measured: the most-signed group in a ten-way clustering scores 16 of 24 on the
  back-testing corpus while a less-signed one scores 22.
- **It does not make a good ranking.** Scoring words by how much more the signed
  half uses them finds the *work*, not the writing. Agents get pointed at
  typecheck failures and lockfile bumps, so that vocabulary comes back, with a
  tool's own name (`bugbot`, at 462×) at the top. That list catches **9 of 24**.

So the signature is used in exactly one place below: choosing which of five
groups to publish. Everything else is a contrast against the corpus.

## The five steps

**1. Sample.** Ten windows of five minutes a day, one from each 2.4-hour block,
with start times derived from the date so any day can be re-collected to the
second. About a thousand descriptions a day.

History was seeded rather than crawled. Every day from January 2025 to September
2026 already existed as a published file of raw descriptions in
[louisabraham/load-bearing](https://github.com/louisabraham/load-bearing), so
those days were read from there in a few minutes instead of collected ten
requests at a time over several months. Every day since is our own. Each day
file records which, under `source`, because the two collect differently and a
window straddling the seam is comparing two samples rather than one. This is a
fact about where the text came from, not about the method.

**2. Split off the signature.** Tools sign in two shapes: a trailing line whose
grammar is attribution ("Generated with", "Co-authored-by"), or an HTML comment
carrying a shouted sentinel, which is how Cursor signs. Both are matched on
form, not on product name, and both leave the text before any word is counted.

**3. Keep the bag, drop the prose.** Each description becomes a list of words
and how often each occurred. Order is gone, the signature is gone, and the
account name becomes a number meaningful only inside its own day. One gzipped
file per day in `data/docs/`, about 150 KB.

**4. Find the register, then rank against everything else.** Cluster forty days
of descriptions into **five** groups by word use, with the signatures hidden
from the fit, and take the group with the largest signed share. Then score each
word by

```
rate of the word inside that group  ÷  rate of the word in every other description
```

The second term is the whole point. A ratio of signed against unsigned has no
term for rarity, so `here` and `note` outrank `amendment` and `cited`. A
contrast against the rest of the corpus buries any word everybody uses.

Five groups, not ten, and this matters. At ten the register splits in two and
the wrong half wins the signed share; at five it is one group and three
independent ways of choosing it — signed share, how well its vocabulary marks
machine writing *elsewhere*, and how fast it grew — all agree. That agreement is
checked on every build and reported when it fails, because a disagreement means
the clustering has split the register and the list is drawn from part of it.

**5. Drop what only lives in one corner.** Cluster again, into ten small groups. The
register does not become one of these — it spreads across several, and one
small group is 95% register, its densest part. Check each candidate word inside
every small group, signed against unsigned, and drop any word common enough to be
measured in exactly one of them. Words spread across several parts are kept,
and so is anything too rare to be measured anywhere: **this test may remove
evidence and never demand it.** Requiring a word to lift in three small groups rather
than merely not-fail in one costs ten of the twenty-four documents, because the
requirement is a frequency floor and the rare words are the signal.

Two obvious readings of step 5 are both wrong, and were both checked. It is not
a rarity filter: the words it drops are *rarer* in ordinary human prose than the
ones it keeps. And it is not merely reaching further down the ranking: at a list
of 1,200 it scores 21 of 24 against 20 for an unfiltered list of the same
length, and 20 for an unfiltered list of the same depth.

## What it scores

Against `data/corpus`, at each rule's own shipped threshold:

| | false alarms | machine documents caught |
|---|---|---|
| `load-bearing` | 1 of 24 | 22 of 24 |
| `ai-vocabulary` | **0 of 24** | 20 of 24 |

Allowing one false alarm for both, the derived list reaches 21 of 24 against
their 22; allowing none, both reach 21. Both miss `government-1` and `policy-1`,
which are bureaucratic registers where the human half already reads like the
machine half.

The route there is worth recording, because most of it was wrong:

| what was ranked | catches |
|---|---|
| signed against unsigned, whole corpus | 9 of 24 |
| the same, compared separately inside each small group | 9 of 24 |
| register against the rest, ten groups, most-signed picked | 16 of 24 |
| register against the rest, five groups | 18–21 of 24 |
| and with step 5 | **21–22 of 24** |

The last two rows are ranges over four fits — two window lengths, three random
seeds. Step 5 does not only raise the number, it collapses the spread.

## What is hardcoded, and what is not

Which tools exist is the one fact that goes stale by itself, so it is
discovered. `tools/pr-markers.mjs` looks for attribution-shaped lines that
`data/markers.json` does not know, and proposes them through a pull request
that is redone weekly, so a candidate that turns out to be a fluke disappears
before it is merged. Nothing is added automatically.

Everything else is a stated number, written where it is used, in the header of
`tools/pr-cluster.mjs`:

| | | |
|---|---|---|
| `K_REGISTER` | 5 | groups in the coarse fit, where the register has to stay whole |
| `K_SMALL` | 10 | small groups in the fine fit, used only to remove words |
| `MIN_DF` | 25 | descriptions a word needs across the window to enter the vocabulary |
| `MIN_IN` | 8 | and on each side of a small group before that small group can judge it |
| `MIN_SIDE` | 40 | a small group needs this many on each side to judge anything |
| `MIN_GROUP` | 0.03 | a group smaller than this is noise, not a register |
| `PRIOR` | 25 | appearances credited to a word outside its group, so a word seen nowhere else is ranked by how often it was used inside rather than by a tiny divisor |
| `TOP` | 1200 | words published |
| `ENGLISH_MIN` | 0.12 | share of function words for a description to count as prose |
| `TOKENS_MIN` | 25 | below this a description is a stub |
| letters per word | 3 | below this the list fills with `375px` and `a2` |

A number you can read and argue with is better than a formula that hides one.
`K_REGISTER` is the one that was chosen by measurement rather than by taste, and
the build re-checks it: if the three ways of picking the register stop agreeing,
the register has split and the number is wrong.

## What it will not tell you

**The control is not human.** Plenty of machine-written descriptions carry no
signature. That makes the two groups more alike, so every score is an
underestimate.

**This is software prose.** The words are derived from pull requests and carry
that shape. Whether a difference found there carries over to an essay is a
separate question, which is what `data/corpus/` exists to answer: twenty-four
topics, each written once by a person before these tools existed and once by a
model, so the only thing left between the two halves of a pair is register.

**A signed description is one tool's users.** People who leave the footer in
place are not a random sample of everyone writing with a machine.

**One register, not all of them.** The coarse fit publishes a single group. If
machine writing has settled into two distinguishable registers, this reports the
larger and says nothing about the other.

**The threshold is calibrated on 24 documents.** It sits above every human
document in the corpus with a margin rather than on the highest one, because 24
documents cannot resolve a boundary more finely than that. Sitting on the
maximum would read 21 of 24 instead of 20 and be worth less than it looks.

## The page

[The vocabulary page](https://bheijden.github.io/slop/web/vocabulary.html) is
built to be checked rather than believed. It opens with a glossary, because
`signed`, `register`, `group`, `small group` and `lift` are all terms invented
here and nothing on the page means anything without them. Then:

- **What a plain ratio would have published**, next to what the contrast
  publishes, so the failure the method exists to fix is visible rather than
  described.
- **The five groups**, with the signed share that chose one of them, and a
  stacked chart of every group's share of the corpus across all 88 weeks. The
  register goes from 1.1% of descriptions to 18.7%, which is a second and
  entirely independent reason to believe the choice: the group picked for having
  the most signatures is also the one that arrived.
- **Every group's word list**, paged through with the arrows or the arrow keys.
  Each is built the same way as the published one, so what you read is what
  would ship had that group been the register.
- **Each word's weekly rate** per million words since January 2025, drawn twice:
  over all descriptions, and over signed ones only. Neither the ranking nor the
  filter ever looked at a date or a signature, so the signed line sitting four
  or five times above the other is a check the derivation could have failed and
  did not.

To try the list on your own text, open [the checker](https://bheijden.github.io/slop/web/)
and tick `ai-vocabulary` in the rules panel. It is loaded but off, like every
candidate set.

## Running it

```sh
node tools/pr-sample.mjs 2026-09-01              # sample one day
node tools/pr-sample.mjs 2026-08-01..2026-09-01  # a range
node tools/pr-sample.mjs --backfill 5            # the 5 oldest missing days
node tools/pr-sample.mjs --source search 2026-09-01   # ignore the archive
node tools/pr-sample.mjs --archive ./days 2025-01-01..2026-09-01
node tools/pr-cluster.mjs --days 40              # derive, and report
node tools/pr-cluster.mjs --days 40 --write      # and rebuild the rule
node tools/pr-page-data.mjs                      # rebuild what the page reads
node tools/pr-markers.mjs --days 21              # look for unrecognised signatures
node tools/score-list.mjs                        # score every word list on data/corpus
node tools/audit.mjs                             # score every rule on data/corpus
```

CI samples every morning and re-derives on Mondays, filling in ten days of
older history on every run, so the archive fills itself in from the back.

`rules/load-bearing.json` is a separate thing entirely: a port of an outside
word list, tracked by its own workflow so both sets stay current. See
[research/load-bearing-labels.md](../research/load-bearing-labels.md).
