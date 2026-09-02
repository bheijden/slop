# Rule audit against a matched human/AI corpus

An audit, not a tuning run. Nothing here changed a rule. The point was to find
out how the rule sets behave on prose written for other purposes.

> The corpus now lives in the repository, at
> [`data/corpus/`](../data/corpus/README.md), and has since grown to 24 pairs
> across 12 registers. Every number in this file is from the 18-pair state it
> was written against and has been left as it stood; `node tools/audit.mjs`
> re-runs it against whatever the corpus currently holds.

## Method

Eighteen human documents and eighteen AI documents, six registers, three pairs
each. Every AI piece covers the same topic and the same key points as the human
piece it is matched to, so topic is controlled and only the writing is free to vary.

**Every human text was published before 2022**, verified from the source rather
than from a search result: Project Gutenberg release dates, arXiv and PubMed
Central submission dates, the Hacker News Algolia API timestamp, on-page
datelines, RFC and PEP headers with dates. Text published after 2022 may have been
written with a model without anyone saying so, which would ruin, without any sign, the
comparison.

The AI pieces were written by subagents given a topic, an audience, a length and
a list of points, and nothing else. They were given nothing about this project,
about linting, about slop, or that a comparison existed. The key points were
extracted as plain content, never as phrasing, so there was nothing to imitate.

Every number below was computed from the files. No agent reported a statistic.

| | documents | words |
|---|---|---|
| human, pre-2022 | 18 | 17,375 |
| AI, written blind | 18 | 16,884 |

## The summary, which is not good news

**The two sets that ship on by default fire about twice as often on human prose
as on AI prose.**

| | human per 1000 | AI per 1000 |
|---|---|---|
| `simonwillison` + `wikipedia-ai` | **1.96** | **1.01** |
| the same, after the `not-just` replacement below | **1.84** | **1.01** |
| all slop sets together | 3.11 | 4.32 |

Per register, with the shipped sets, human prose scores higher in five of six:

| register | human | AI |
|---|---|---|
| academic | 3.0 | 0.4 |
| forum | 2.9 | 1.7 |
| government | 1.3 | 1.0 |
| journalism | 1.5 | 1.3 |
| literary | 0.6 | 1.3 |
| techdoc | 2.9 | 0.3 |

## Per-set scorecard

Ratio is AI rate over human rate. Above 1 means the set fires more on AI, which
is the direction a detector wants. `silent` counts rules that never fired on
either corpus.

| set | rules | silent | human/1k | AI/1k | ratio | human docs hit |
|---|---|---|---|---|---|---|
| `sloptells` | 14 | 12 | 0.12 | 1.72 | **14.9x** | 11% |
| `antislop` | 12 | 10 | 0.06 | 0.24 | **4.1x** | 6% |
| `economist` | 6 | 4 | 0.35 | 1.13 | **3.3x** | 33% |
| `antislop-fiction` | 10 | 10 | 0.00 | 0.00 | silent | 0% |
| `arxiv-slop` | 1 | 1 | 0.00 | 0.00 | silent | 0% |
| `structural` | 2 | 2 | 0.00 | 0.00 | silent | 0% |
| `wikipedia-ai` | 11 | 8 | 0.40 | 0.24 | 0.6x | 33% |
| `slop-gate` | 28 | 24 | 0.35 | 0.18 | 0.5x | 22% |
| `simonwillison` | 27 | 16 | 1.55 | 0.77 | 0.5x | 67% |
| `humanizer-de` | 2 | 1 | 0.23 | 0.06 | 0.3x | 22% |
| `em-dash` | 1 | 0 | 2.30 | 0.00 | 0.0x | 44% |
| `slopster` | 7 | 6 | 0.06 | 0.00 | 0.0x | 6% |

The two sets on by default are the two poorest separators in the table, and
the three strongest are all candidates that are off.

## What fires only on AI

Ten rules hit AI prose and never matched a human document. These are the ones
bringing the tool.

| rule | set | share of AI documents |
|---|---|---|
| `genuinely` | sloptells | 22% |
| `no-chain` | simonwillison | 17% |
| `not-x-but-y` | antislop | 17% |
| `thats-the-part` | simonwillison | 11% |
| `colon-triple` | simonwillison | 11% |
| `the-entire-is`, `is-real`, `is-the-whole` | simonwillison | 6% each |
| `nominalisation-pileup` | economist | 6% |
| `leverage` | slop-gate | 6% |

## The worst false positive

`echo-triad` fires on **56% of human documents** and 6% of AI ones, a ratio of
0.1x. It looks for consecutive sentences sharing a word skeleton, and formal
prose does that on purpose:

<!-- slop-ignore-start -->
> In this study, we investigate the relationship between skull morphology,
> performance, and trophic ecology. We implement an integrative approach...
<!-- slop-ignore-end -->

That is scholarly convention, not a tell. The rule is the single largest
contributor to the shipped sets scoring worse than chance, and it is worth a
decision. No change was made here.

`em-dash` fires on 44% of human documents and **0%** of AI documents. That is
a 4th independent confirmation that the em dash points the other way, now on
new matched data, and the first from this project's own corpus. It stays, because it
is a house-style rule and was never put forward as detection.

## Per-rule findings

The set-level numbers hide what is actually happening. Of 121 slop rules, 94
never fired at all, and the rest split into four groups.

### The strongest single signal is parentheses

`paren-scarcity` fires on **18 of 18 AI documents and 6 of 18 human ones**.
Counting the characters directly:

| | documents | parentheses |
|---|---|---|
| human, pre-2022 | 18 | **184** |
| AI, written blind | 18 | **0** |

Not one parenthesis in 16 thousand words of AI prose, across all six
registers. The Economist reported the same thing from four different models and
called it "hardly any parentheses"; this is an independent confirmation with a
cleaner separation than expected.

It is a *scarcity* signal, which is why no word-list approach could have
found it. Six human documents also use none, so as a document-level flag it runs
at about three quarters precision and full recall on this corpus.

One limit to record. All eighteen AI pieces came from one model on one
prompt. This could be a habit of that model, not a property of machine
prose. The Economist's four-model result is what makes it credible.

### Rules that fire on humans and not on AI

These are the false positives, and they are concentrated in a handful of rules.

| rule | human docs | AI docs | what it is actually catching |
|---|---|---|---|
| `echo-triad` | **10 of 18** | 1 | parallel construction in formal prose |
| `em-dash` | 8 | 0 | house style, working as intended |
| `stacked-questions` | 3 | 0 | rhetorical questions in essays |
| `moreover` | 3 | 0 | "Moreover," and "Additionally," in academic writing |
| `uniform-sentence-length` | 4 | 1 | even rhythm in institutional prose |

`echo-triad` is the worst rule in the project on this evidence. Its hits are
scholarly convention:

<!-- slop-ignore-start -->
> In this study, we investigate the relationship between skull morphology...
> The first four of these papers simply focus on system performance...
<!-- slop-ignore-end -->

`stacked-questions` catches an essayist setting up a topic, which is a rhetorical
move older than the technology it is meant to detect:

<!-- slop-ignore-start -->
> Who are the speakers of AAE? How are they viewed?
<!-- slop-ignore-end -->

### Rules that fire on both about equally

`not-just` (5 human, 3 AI), `stranded-auxiliary` (2 and 2), `note-that` (1 and
<!-- slop-ignore-start -->
1), `robust` (1 and 2). These carry no information about authorship either way.
<!-- slop-ignore-end -->
`not-just` is the interesting one, because its human hits are ordinary English and not
than the rhetorical move it is aimed at.

### Rules that fired only on AI

| rule | AI documents | example |
|---|---|---|
| `rather-than` | 10 of 18, 24 hits | 12 times the human rate |
| `genuinely` | 4 | |
| `not-x-but-y` | 3 | "not the posted wage but the" |
| `no-chain` | 3 | "no announcement, no decision anyone had to defend" |
| `thats-the-part` | 2 | "this is the part" |
| `colon-triple` | 2 | |
| `the-entire-is`, `is-real`, `is-the-whole` | 1 each | |
| `nominalisation-pileup`, `leverage` | 1 each | |

`rather-than` needs a note. It was the rule marked during mining as too noisy
on engineering documentation, where
<!-- slop-ignore-start -->
"rather than"
<!-- slop-ignore-end -->
is ordinary. Across six mixed
registers it is the 2nd-strongest separator in the project. Its value is
register-dependent, exactly as the mining log expected.

### The 94 that never fired

| set | silent rules |
|---|---|
| `slop-gate` | 24 of 28 |
| `simonwillison` | 16 of 27 |
| `sloptells` | 12 of 14 |

Reporting nothing is not failure. A rule for a phrase that did not come up says nothing
about itself. But it does mean most of the library is untested by this exercise,
and that a few rules each do most of the work.

## Variants, or trying to fix the false firers

Every original is still included unchanged. The alternatives were scored against the
same corpus and are recorded as specifications below and not as live rules.

### What the false positives turned out to be

<!-- slop-ignore-start -->
Reading the actual matched text settled the design. Every `echo-triad` hit on
<!-- slop-ignore-end -->
human prose shares a **topic** phrase, not a structure:

<!-- slop-ignore-start -->
| document | shared run |
|---|---|
| academic paper | "performance and trophic ecology" |
| government guidance | "the person who died" |
| Python PEP | "in the python 2" |
| forum comment | "if you find a" |
<!-- slop-ignore-end -->

Those repeat because they are what the document is about. The tell the rule is
named for shares a **frame**: "is an object in the system", where the nouns swap
and the skeleton holds. The difference is measurable without a parser. A frame is
mostly closed-class words; a topic is mostly content words.

Two new `echo` params came out of that, both defaulting off so the original is
unchanged. `anchored` requires the shared run to sit at the same end of both
sentences, and `minFuncWords`, requiring it to carry closed-class words.

### Scores

Lower human is better, higher AI is better, and `canon` is whether the rule still
catches the example it exists for.

| rule | human docs | human hits | AI docs | AI hits | canon |
|---|---|---|---|---|---|
| **`echo-triad`** (original) | 10 of 18 | 19 | 1 | 1 | yes |
| `echo-aligned` | 2 | 2 | 0 | 0 | yes |
| `echo-run3` | 2 | 2 | 0 | 0 | yes |
| `echo-aligned-func` | 2 | 2 | 0 | 0 | yes |
| `echo-structural` | **0** | 0 | 0 | 0 | yes |
| **`stacked-questions`** (original) | 3 | 4 | 0 | 0 | yes |
| `stacked-questions-run3` | **0** | 0 | 0 | 0 | yes |
| **`not-just`** (original) | 5 | 5 | 2 | 3 | yes |
| `not-just-tight` | 1 | 1 | **0** | 0 | yes |
| `not-just-nosub` | **3** | 3 | **2** | **3** | yes |
| **`moreover`** (original) | 3 | 4 | 0 | 0 | yes |
| `moreover-density` | 0 | 0 | 0 | 0 | n/a |

### What that says, rule by rule

**`not-just-nosub` is the only unambiguous improvement in the exercise.** It
cuts two human hits and keeps all three AI hits. Reading the matches explains
why. Three of the original's five human hits were people using the construction
correctly, which no rule should suppress, and only two were real errors, both of
the form where "not only" negates a clause and not a thing. Excluding
subordinating conjunctions removes exactly those two and nothing else.
`not-just-tight`, which required a determiner at each end, scored better on
paper and is worse, having thrown away every true positive along with the noise.

**Every `echo-triad` variant cuts false positives by 80% or more** and still
catches the canonical example. Which one is best cannot be settled here, because
the corpus contains essentially no true positives for this rule to find. On
precision by itself `echo-structural` leads; on the evidence available, any of them is
a large improvement.

The uncomfortable part is what the remaining hits are. The best variants still
flag this, from a human forum comment:

<!-- slop-ignore-start -->
> If you find a simple way, that's great, but it can be copied by anyone...
> If you find a massively complicated way...
<!-- slop-ignore-end -->

That is a person using parallel construction on purpose, and it is
hard to tell from a machine doing it by rote, because they are the
same thing. A tightened echo rule flags rhetoric, not authorship.

**`stacked-questions-run3` removes every false positive** and keeps the
canonical example. Its cost cannot be measured, because neither version fired on AI prose
at all, so the change is a free precision gain on this evidence and untested for
recall.

**`moreover-density` has no evidence either way.** It never fired on either
corpus, and the `canon` column shows n/a because a density rule needs 100
words and the canonical example is one sentence. Its starting assumption, that the tell is
every paragraph opening with a connective, not any single "Moreover", is
what the sources describe, but this corpus does not test it.

### `uniform-sentence-length`, with no variant, because there is no signal

Sentence-length variation was measured directly on both corpora, as a
coefficient of variation per document:

| | min | median | max |
|---|---|---|---|
| human | 0.30 | **0.52** | 0.84 |
| AI | 0.36 | **0.52** | 0.73 |

The same medians, and near-total overlap. The AI range is slightly tighter,
which points the right way. But the distributions overlap almost entirely, so no
threshold separates them and reformulating the rule would not change that. The rule stays as what it always
presented as. It is an observation about monotony in your own draft, not evidence
about who wrote it.

## What was decided

Three outcomes, on a principle to record. **The two shipped sets are a port
of someone else's artifact**, generated from a pinned copy of Simon Willison's
highlighter in `vendor/`. Changing one is not editing our rule, it is diverging
from upstream. So any difference has to be intended, visible, and backed by a
number. `tools/build-rules.mjs` now carries two tables that do exactly that, and
both come through re-vendoring intact.

### Replaced, `not-just`

The only change to a shipped rule. Upstream also matches the form where "not
only" negates a clause and not a thing, and a negative lookahead for
subordinating conjunctions removes exactly those:

| | human docs | human hits | AI docs | AI hits |
|---|---|---|---|---|
| upstream | 5 of 18 | 5 | 2 of 18 | 3 |
| shipped now | **3 of 18** | 3 | **2 of 18** | **3** |

Every true positive kept, two false positives gone. It justifies the replacement
because it is the same tell, negative parallelism between two parallel things.
The three human hits that remain are people using the construction correctly,
which is not this rule's business to suppress.

### Kept, with the false firing documented, `echo-triad` and `stacked-questions`

Both are upstream's, and the shapes they describe are real. Neither is changed.
Both now carry a `note` recording what they do on human prose, so anyone reading
a finding can assess it, and `slop explain <rule>` prints it.

`echo-triad` hit 10 of 18 human documents and 1 of 18 AI ones.
`stacked-questions` hit 3 human and 0 AI.

A rule with its failure mode written down is unlike a rule that
misfires without warning, and this is the easier part of the fix.

### Recorded, not kept as rules

The alternatives were a set of their own for a while. They are specifications,
not rules. Nothing was promoted, three of the four are a parameter or two
on a rule that already exists, and a set of unpromoted alternatives kept next to
the originals invites someone to enable both and see the same result reported
twice. The measurements are above; the implementations are here, which is all it
takes to rebuild any of them.

| alternative to | kind | specification | scored |
|---|---|---|---|
| `echo-triad` | `echo` | `{"minGram":4,"minRun":2,"anchored":"either","minFuncWords":2}` | 2 of 18 human, 0 AI, catches the canonical example |
| `echo-triad` | `echo` | `{"minGram":4,"minRun":3,"minFuncWords":3}` | 0 of 18 human, 0 AI, catches the canonical example |
| `stacked-questions` | `question-chain` | `{"minRun":3}` | 0 of 18 human, 0 AI, catches the canonical example |
| `moreover` | `density` | pattern `(?:^\|\n)\s*(?:Moreover\|Furthermore\|Additionally\|In\s+addition\|Notably\|Consequently\|Nevertheless\|However\|Therefore)\s*,`, `{"min":6,"minWords":100,"minSentences":5}` | never fired on either corpus |

`anchored`, `minFuncWords` and the `density` kind are all in the engine, so each
line above is a working rule the moment it is pasted into a set.

### Formerly kept as candidates

`echo-aligned`, `echo-run3`, `echo-aligned-func`, `echo-structural`,
`stacked-questions-run3` and `moreover-density` remain in
this document as specifications. Any is a working rule the moment it is pasted
into a set.
None was promoted, for two different reasons.

The echo variants cannot be separated on the evidence, since they all cut false
positives by 80% or more and the corpus holds no true positives to rank them by.
Promoting one would be picking on taste and calling it measurement.

`stacked-questions-run3` removed every false positive at no measurable cost, and
is the strongest candidate for the next promotion. It is kept off only because
neither version fired on AI prose at all, so its recall is untested, not
confirmed.

### The honest limit

None of this makes the shipped sets a detector. They still fire more on human
prose than on AI prose overall, 1.84 against 1.01 per thousand words after the
change, down from 1.96. The distance closed a little but not fully, and one rule change
was never going to close it. What these rules are good for is the thing they were
built for, which is pointing at worn phrasing so a writer can decide.

## Cut in the merge

Merging ten sets into one made it worth asking whether any rule was already
covered by another. `tools/find-redundant.mjs` resolves it by testing whether
every one of a rule's `tests.hit` examples is matched by some other rule. It looks
at span rules only, since document-level rules all fire on any fixture long enough to
meet their word minimum, so coverage there says the fixture is long, not that
the rules overlap.

Three mined rules were entirely inside a shipped one and are gone:

| dropped | already covered by |
|---|---|
| `seamless` | `wikipedia-ai/ai-vocab`, which matches the same word |
| `underscore-importance` | `ai-vocab`, which matches `underscore` on its own |
| `fast-paced-world` | `wikipedia-ai/landscape`, which takes any noun after the adjective |

All three came from slop-gate, and their existence is a small finding in itself.
two independently assembled word lists ended on the same items.

Two variants went with them. `not-just-nosub` won its comparison and is now the
shipped `not-just`, so the bench copy was a duplicate of a shipped rule.
`not-just-tight` lost, losing every true positive along with the noise.

The echo bench went from four to two. `echo-aligned` and `echo-run3` each apply
one of the two constraints that `echo-aligned-func` applies together, and all
four scored the same, so the two single-constraint forms were components,
not competitors. What remains are the two composites, `echo-aligned-func`
built on alignment, `echo-structural` on run length.

What still shows as covered is all expected. `whole` appears inside `is-the-whole`, both
upstream's; and each variant covering the rule it is a variant of, which is what
a bench is for.

## Regrouped by evidence

The scores live on the rules themselves. Every rule in `candidates/mined.json`
carries an `evidence` field saying what it did on this corpus, alongside `from`
and `source` saying where it came from. `slop explain <rule>` prints all three,
and `tools/group-by-evidence.mjs` recalculates them when the corpus gets bigger.

Across the 83 mined rules: 6 fire on AI and rarely or never on human, 6 fire more
on human than AI, 1 fires about equally, and 70 never fired at all.

These used to be four separate sets, `measured-proven` among them. They were
views over the same rule ids, which made them easy to double count and added four
entries to a list that was already too long. The grouping is a property of a
rule, not a place to put it.

## What this does not show

**The sample is small.** Eighteen pairs, about a thousand words each. A rule
firing on one document moves its share by six points.

**108 of 173 rules never fired at all.** On 34,000 words. Most of the library is
untested by this exercise , not validated by it.

**The AI prose here is good.** It was written to a brief, by a capable model,
with real points to make. It is not the unedited output that slop is named for.
So this measures whether the rules can separate good AI writing from good human
writing, which is the harder question and the right one for false positives, and
it understates how the rules do against actual slop.

**The human prose here is edited and published.** Gutenberg essays, peer
reviewed papers, wire copy. That is the best human writing, not the average.
Both corpora sit at the top of their distributions.

The honest reading is that these rules are weak evidence about authorship and
better used as what they were built for, which is marking worn phrasing so a writer can
decide. The precision numbers matter more than the ratios, and on precision the
tight rules do well and a handful of loose ones do the damage.
