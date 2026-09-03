# Where the word list comes from

slop ships one rule that works differently from all the others. Every other
rule is a pattern somebody wrote down. This one is a list of about 1,200
ordinary English words, and a document that reaches for a lot of them at once
is probably machine-written. The list is rebuilt from scratch every week.

This page explains how the list is made, why the obvious way of making it
fails, and what evidence there is that the way we settled on works.

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

Everything below depends on that last point. Across the whole archive, about
one description in twelve carries a stamp from the tool that wrote it. Over the
last two months it has been closer to one in four. We cut the stamp off before
counting a single word, so nothing downstream can cheat by learning the stamp
itself.

We now have 609 days of this, back to January 2025 (about 274,000 descriptions,
32 million words).

## What the stamp does and does not tell you

It tells you exactly one thing, and it tells you it perfectly. **This
particular description was written by a machine.**

It does not tell you that the *unstamped* ones were written by people. Plenty
of machine-written text has the stamp removed, or came from a tool that never
added one. The unstamped pile is a mixture, not a control group.

That distinction is easy to nod along to and expensive to forget. We forgot it
twice.

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

The fix is to stop comparing stamped against unstamped, and start comparing one
*kind of writing* against every other kind.

### Step 1. Sort the descriptions into five piles by the words they use

This is ordinary clustering. Descriptions that reach for similar vocabulary end
up together, and the sorting never sees the stamps. It looks only at which
words turn up alongside which.

The five piles come out like this:

| pile | descriptions | share carrying an AI stamp | words that characterise it |
|---|---|---|---|
| **0** | 4,136 | **44%** | drawn, somebody, ruling, priced, cell, figure |
| 1 | 7,436 | 2% | exact-head, rebase/retry, preserve, automerge |
| 2 | 4,237 | 27% | logger, str, pid, ctx, err, tuple |
| 3 | 3,654 | 32% | pull_request, yml, dependabot, workflow_dispatch |
| 4 | 4,541 | 31% | logo, hero, icons, nav, aria-label, sidebar |

Piles 1 to 4 are recognisably about *subjects*: git plumbing, backend code,
build configuration, front-end work. Pile 0 is not about a subject at all. Its
characteristic words are the connective tissue of English prose, and it is the
pile where nearly half the descriptions carry an AI stamp.

Pile 0 is the one we publish.

### Step 2. Score each word against every other pile combined

A word scores 7.4x if descriptions in pile 0 write it 7.4 times as often as the
rest of GitHub does.

That "rest of GitHub" half of the fraction is what was missing before. A word
everybody uses has a large number underneath it and cannot score highly,
however fond of it AI happens to be. This is what finally puts `amendment`
above `here`.

### Step 3. Sort again into ten finer piles, and drop the narrow words

Pile 0 is not uniform. Cut the same descriptions ten ways instead of five and
it breaks into pieces, most of it into one and the rest spread over three or
four others. Some words live only in one of those pieces. `somebody`, `priced`,
`rectangle` and `morning` are all like this. They score well in step 2, but
they belong to one corner of pile 0, not to pile 0 as a whole, so they go.

A word too rare to be measured anywhere is **kept**, and that matters more than
it sounds. We first wrote this step as a requirement, where a word had to
*prove* itself in three piles or be dropped. That version costs ten of the
twenty-four documents, because proving anything requires a word to be common,
and the rare words carry most of the signal. The test may only take a word
away. It may never demand that one earn its place.

About 1,200 words survive. The top of the list:

```
drawn  ruling  cell  figure  draws  beat  instrument  picture  population  drew
```

## Three reasons to believe it

None of these were used to build the list. Each of them could have come out
wrong.

**The pile grew, and nothing in the method knows about time.** The clustering
saw no dates at all. Assign all 609 days to the five piles afterwards and pile
0 runs from **1.1%** of all pull requests in January 2025 to **18.7%** in
August 2026, seventeen times larger.

The other four move too, and it would be dishonest to say otherwise. Pile 1
falls from 57% to 32% as the others take share from it, and pile 3 more than
doubles. But pile 0 is the only one that starts at essentially nothing. The
others were already there in January 2025 and got bigger or smaller. Pile 0
*appeared*.

**The stamps agree, word by word.** Take any word on the list and count it
separately in stamped and unstamped descriptions across the whole archive.
`drawn` appears 63 times per million words in stamped ones against 13 in
unstamped. `nobody`, 129 against 27. Four to five times more, consistently,
across the list. Step 2 never looked at a stamp.

**It works on writing that has nothing to do with software.** `data/corpus/`
holds 24 topics, each written twice: once by a person and published before
generative writing tools existed, and once by a language model given the topic,
the audience and a list of points to cover, and never shown the human version.
Twelve kinds of writing in all, among them academic papers, journalism, essays,
government guidance, technical documentation, letters and travel writing. Both
halves of a pair say the same things at the same length, so the only thing left
between them is *how* they are written.

At the threshold the rule ships with, it flags **0 of the 24 human documents
and 20 of the 24 machine-written ones.**

For comparison,
[louisabraham/load-bearing](https://github.com/louisabraham/load-bearing),
which arrives at a similar list by a different route, flags 1 human and 22
machine on the same test. Allow neither list a false alarm and the two tie at
21.

## What this cannot tell you

**It is built from software writing.** The words come from programmers
describing code changes (and reviewing them, and arguing about them). That the
difference carries over to essays is something the 24-pair test supports
without proving. Twenty-four documents is a small test.

**Every number here is a floor.** The unstamped pile contains machine-written
text, which makes the two sides look more alike than they are. Whatever
difference we measure, the real one is larger.

**Only tools that leave a stamp are represented.** Anyone who deletes the
footer, or uses a tool that never adds one, is invisible to us.

**No word on the list is evidence by itself.** `figure`, `beat` and `picture`
are ordinary words. The rule fires on a document using *many* of them at once,
never on one. Human writers use every one of them constantly.

## Reproducing it

```sh
node tools/pr-sample.mjs 2026-09-01              # collect one day
node tools/pr-sample.mjs --backfill 5            # fill the five oldest gaps
node tools/pr-cluster.mjs --days 40              # rebuild the list, and report
node tools/pr-cluster.mjs --days 40 --write      # and write it into the rule
node tools/pr-page-data.mjs                      # rebuild what the web page reads
node tools/score-list.mjs                        # score every word list on the 24 pairs
node tools/audit.mjs                             # score every rule on the 24 pairs
```

Every number the method uses is a constant near the top of
`tools/pr-cluster.mjs`, each with a comment explaining the choice. The two that
matter most are these.

- **Five piles, not ten.** At ten, the AI writing splits across two piles and
  the larger of the two is a false lead. At five it holds together, and three
  separate ways of picking the right pile all land on the same one. The build
  checks that agreement every time and says so when it breaks.
- **A word must appear in 25 descriptions** before it is considered at all.
  Below that, one prolific author can invent a word single-handed.

The only thing kept up to date by hand is which AI tools exist, since new ones
keep appearing and each stamps its work differently. `tools/pr-markers.mjs`
watches for unfamiliar stamps and opens a pull request proposing them. Nothing
is added automatically.

Collection runs every morning and the list is rebuilt every Monday, both by
[GitHub
Actions](https://github.com/bheijden/slop/blob/main/.github/workflows/pr-vocabulary.yml).
[The web page](https://bheijden.github.io/slop/web/vocabulary.html) shows the
current state, showing all five piles, the words in each, and how often each
word has been written every week since January 2025.

## A note on this page

Run slop over this file and it fires. 85 of its 1,672 words are on the list,
which is well past the threshold.

That is not a bug and it is not irony. A page explaining a vocabulary has to
use that vocabulary, and the words on the list are ordinary English (`figure`,
`piece`, `whole`, `says`) that any explanation of anything reaches for. It is a
good illustration of the last warning above: the rule measures a rate across a
whole document, it has no idea what the document is about, and a human writer
can absolutely trip it. A finding is a prompt to reread a passage, never a
verdict on who wrote it.

`rules/load-bearing.json` is a separate thing entirely: a port of somebody
else's list, tracked by its own workflow so that both stay current. See
[research/load-bearing-labels.md](../research/load-bearing-labels.md).
