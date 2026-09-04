# Where the word list comes from

slop ships one rule that works differently from all the others. Every other rule
is a pattern somebody wrote down. This one is a list of about a thousand
ordinary English words, and a document that reaches for a lot of them at once is
probably machine-written. The list is rebuilt from scratch every week.

The method is not ours. It is Louis Abraham's
[load-bearing](https://louisabraham.github.io/load-bearing/)
([source](https://github.com/louisabraham/load-bearing)), reproduced here, with
one deliberate change described below. This page explains
how it works, what the one change is, and how we know it helps.

## Where the raw material comes from

Every day we collect about a thousand pull request descriptions from public
GitHub repositories. A pull request description is the paragraph or two a
programmer writes to explain a change to whoever will review it.

Three things make it unusually good material:

- **There is a lot of it, and more every day.** Most public writing is a fixed
  archive. This refreshes.
- **It is ordinary work writing.** Nobody is performing. They are explaining a
  change to a colleague.
- **A growing share of it is written by AI, and says so.** Claude Code, Codex,
  Cursor, Copilot and others add a line at the end of what they write:
  `Generated with Claude Code`, `Co-authored-by: ...`, or an HTML comment with
  the tool's name in it.

Everything below depends on that last point. Across the whole archive, about one
description in twelve carries a stamp from the tool that wrote it. Over the last
two months it has been closer to one in four. We cut the stamp off before
counting a single word, so nothing downstream can cheat by learning the stamp
itself.

We now have 609 days of this, back to January 2025.

## What the stamp does and does not tell you

It tells you exactly one thing, and it tells you it perfectly. **This particular
description was written by a machine.**

It does not tell you that the *unstamped* ones were written by people. Plenty of
machine-written text has the stamp removed, or came from a tool that never added
one. The unstamped pile is a mixture, not a control group.

That distinction is easy to nod along to and expensive to forget.

## The obvious approach, and why it fails

The obvious thing is to compare the two directly. For every word, work out how
much more often it appears in stamped descriptions than in unstamped ones, and
keep whatever rises to the top.

We built that. Here is what came back, best first:

```
bugbot   462x       nbsp   57x       seats   6.7x       whole-branch   5.7x
```

`bugbot` is the name of a tool. `nbsp` is an HTML escape. Neither is a way of
writing. Both are traces of *what AI gets asked to do*. Agents get pointed at
type errors, dependency updates and flaky tests, so the comparison hands back
the vocabulary of that work.

There is a second problem, subtler and worse. A ratio like this has no sense of
whether a word is rare to begin with. `here` and `note` are used a little more
by AI, so they score well. `amendment` and `cited` are used far more, but are
not common enough in absolute terms to beat them. The list fills up with words
everybody uses.

Measured against our test set, described near the bottom of this page, a list
built this way correctly flags **9 out of 24** machine-written documents. It is
close to useless.

## What we do instead

Stop comparing stamped against unstamped. Compare one kind of writing against
every other kind.

### Step 1. Sort every description ever collected into ten piles

All 609 days at once, not a recent window. Descriptions that reach for similar
vocabulary end up in the same pile. The sorting never sees the stamps.

The ten piles look like this, most-stamped first. `start` and `end` are each
pile's share of all pull requests in the first and last month of the archive:

| pile | start | end | stamped | most characteristic words |
|---|---|---|---|---|
| **7** | 0.2% | **54.2%** | **41.0%** | nobody, quietly, halves, nowhere, rung |
| 4 | 1.4% | 25.2% | 10.5% | airbyte, --pull, up_to_date, airbyte-ci |
| 3 | 3.4% | 8.1% | 9.0% | focus-visible, icon-only, aria-label, z-index |
| 0 | 3.6% | 5.7% | 8.9% | pullrequest, codeant, sleep, hour |
| 8 | 9.1% | 1.4% | 2.8% | diffhunk, nixpkgs-update, --option |
| 9 | 40.3% | 2.5% | 0.4% | co-authors, seems, stuff, basically |
| 6 | 26.9% | 2.1% | 0.4% | nixos/tests, pkgs/test, x86_64-darwin |
| 1 | 3.7% | 0.7% | 0.3% | scala-steward, rebase/retry, groupid |
| 5 | 8.4% | 0.0% | 0.1% | remediationstrategy, yarn/cache, zero-installs |
| 2 | 3.3% | 0.1% | 0.1% | hasfixes, ismajorupgrade, publisheddate |

Nine of the ten are recognisably about *subjects*: one project's build tooling,
front-end work, dependency bots, Nix packaging. Pile 7 is not about a subject at
all. Its characteristic words are the connective tissue of English prose, four
in ten of its descriptions carry a stamp, and it went from nothing to more than
half of all pull requests in twenty months.

Pile 7 is the one we publish.

### Step 2. Score each word against every other pile combined

A word scores 7.4x if descriptions in pile 7 write it 7.4 times as often as the
rest of GitHub does.

That "rest of GitHub" half of the fraction is what was missing before. A word
everybody uses has a large number underneath it and cannot score highly, however
fond of it AI happens to be. This is what finally puts `amendment` above `here`.

The top of the resulting list:

```
nobody  quietly  halves  load-bearing  nowhere  rung  arms  survived  refusal
handed  refused  precisely  somebody  plainly  outright  worse  asserted  ruling
```

## The one thing we do differently

Everything above is theirs. Here is the change.

**They pick the pile by watching it grow.** Their published pile is the one that
went from under 2% of pull requests to over 20%. **We pick it by the share of
its descriptions that carry a stamp.**

Measured over four fits of the archive at different settings:

| fit | their growth test | our stamp test | best pile available |
|---|---|---|---|
| A | two piles qualify, picks 5/24 | **20/24** | 20/24 |
| B | two piles qualify, picks 20/24 | **20/24** | 20/24 |
| C | two piles qualify, picks 5/24 | **20/24** | 20/24 |
| D | two piles qualify, picks 10/24 | **22/24** | 22/24 |

Their test admitted two candidate piles every time, and taking the larger picks
the wrong one in three of the four. Ours picked the best available pile in all
four, and not narrowly: in fit D the published pile is 41% stamped and the
runner-up is 10.5%.

There is a second reason to prefer it. Growth only identifies machine writing
while machine writing is still arriving. When the share stops climbing, the test
stops working. A stamp has no such expiry.

## Three reasons to believe the result

None of these were used to build the list. Each could have come out wrong.

**The pile grew, and nothing in the method knows about time.** The sorting saw
no dates. Pile 7 runs from 0.2% of pull requests to 54.2% across twenty months.
The other piles move as well and it would be dishonest to say otherwise, but
pile 7 is the only one that starts at essentially nothing. The others were
already there in January 2025 and got bigger or smaller. Pile 7 *appeared*.

**It converges on a list somebody else reached by a different route.** Their
published list and ours agree on **100 of the top 100 words**, and on 837 of
1,200 overall. The two were built from separately collected samples and, at the
one step that matters, by different tests.

**It works on writing that has nothing to do with software.** `data/corpus/`
holds 24 topics, each written twice: once by a person and published before
generative writing tools existed, and once by a language model given the topic,
the audience and a list of points to cover, and never shown the human version.
Twelve kinds of writing in all, among them academic papers, journalism, essays,
government guidance, technical documentation, letters and travel writing. Both
halves of a pair say the same things at the same length, so the only thing left
between them is *how* they are written.

At the threshold the rule ships with, it flags **1 of the 24 human documents and
22 of the 24 machine-written ones.**

The score counts how many *different* list words a document uses, divided by
its length raised to the power 0.7. A count of different things saturates — a
long document runs out of new list words to find — so a plain rate per thousand
words would fall with length and one threshold would mean two things on a page
and on a chapter. The exponent is what makes the threshold portable, and 0.7
rather than the square root because that is what holds the false-alarm rate
steady as documents shorten: see [research/length.md](../research/length.md).

Six of the 24 machine documents score below the highest-scoring human one, and
no threshold separates those. Both numbers here move when the list re-derives
on a Monday, so `tests/claims.mjs` recomputes them and fails if this paragraph
goes stale.

## What this cannot tell you

**It is built from software writing.** The words come from programmers
describing code changes (and reviewing them, and arguing about them). That the
difference carries over to essays is something the 24-pair test supports without
proving. Twenty-four documents is a small test.

**Every number here is a floor.** The unstamped pile contains machine-written
text, which makes the two sides look more alike than they are. Whatever
difference we measure, the real one is larger.

**Only tools that leave a stamp are represented.** Anyone who deletes the footer,
or uses a tool that never adds one, is invisible to us.

**No word on the list is evidence by itself.** `nobody`, `halves` and `worse` are
ordinary words. The rule fires on a document using *many* of them at once, never
on one. Human writers use every one of them constantly.

## Things that were tried and did not work

Recorded in [research/method.md](../research/method.md), because the failures
are more informative than the result: four other ways of using the stamp, and
four departures from the original method that each cost accuracy. The largest
was fitting a recent window instead of the whole archive, which alone cost six
of the twenty-four documents.

## Reproducing it

```sh
node tools/pr-sample.mjs 2026-09-01              # collect one day
node tools/pr-sample.mjs --backfill 5            # fill the five oldest gaps
node tools/pr-cluster.mjs                        # rebuild the list, and report
node tools/pr-cluster.mjs --write                # and write it into the rule
node tools/pr-page-data.mjs                      # rebuild what the web page reads
node tools/score-list.mjs                        # score every word list on the 24 pairs
node tools/audit.mjs                             # score every rule on the 24 pairs
```

Every number the method uses is a constant near the top of
`tools/pr-cluster.mjs`, each with a comment explaining the choice. Most of them
are theirs. The two worth knowing:

- **Ten piles, over the whole archive.** Both matter, and the archive matters
  more. A forty-day window instead costs six of the twenty-four documents.
- **A word must appear in 50 descriptions** before it is considered at all.
  Below that, one prolific author can invent a word single-handed.

The only thing kept up to date by hand is which AI tools exist, since new ones
keep appearing and each stamps its work differently. `tools/pr-markers.mjs`
watches for unfamiliar stamps and opens a pull request proposing them. Nothing
is added automatically.

Collection runs every morning and the list is rebuilt every Monday, both by
[GitHub Actions](https://github.com/bheijden/slop/blob/main/.github/workflows/pr-vocabulary.yml).
[The web page](https://bheijden.github.io/slop/web/vocabulary.html) shows the
current state: all ten piles, the words in each, and how often each word has
been written every week since January 2025.

## A note on this page

Run slop over this file and it fires. Roughly one word in twenty is on the list,
which is well past the threshold.

That is not a bug and it is not irony. A page explaining a vocabulary has to use
that vocabulary, and the words on the list are ordinary English that any
explanation of anything reaches for. It is a good illustration of the last
warning above: the rule measures a rate across a whole document, it has no idea
what the document is about, and a human writer can absolutely trip it. A finding
is a prompt to reread a passage, never a verdict on who wrote it.
