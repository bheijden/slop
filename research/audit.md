# Rule audit against a matched human/AI corpus

An audit, not a tuning run. Nothing here changed a rule. The point was to find
out how the rule sets behave on prose nobody wrote for them.

## Method

Eighteen human documents and eighteen AI documents, six registers, three pairs
each. Every AI piece covers the same topic and the same key points as the human
piece it is matched to, so topic is controlled and only the writing differs.

**Every human text was published before 2022**, verified from the source rather
than from a search result: Project Gutenberg release dates, arXiv and PubMed
Central submission dates, the Hacker News Algolia API timestamp, on-page
datelines, dated RFC and PEP headers. Text published after 2022 may have been
drafted with a model without anyone saying so, which would quietly destroy the
comparison.

The AI pieces were written by subagents given a topic, an audience, a length and
a list of points, and nothing else. They were told nothing about this project,
about linting, about slop, or that a comparison existed. The key points were
extracted as bare content, never as phrasing, so there was nothing to imitate.

Every number below was computed from the files. No agent reported a statistic.

| | documents | words |
|---|---|---|
| human, pre-2022 | 18 | 17,375 |
| AI, written blind | 18 | 16,884 |

## The headline, which is not good news

**The two sets that ship on by default fire about twice as often on human prose
as on AI prose.**

| | human per 1000 | AI per 1000 |
|---|---|---|
| `simonwillison` + `wikipedia-ai` | **1.96** | **1.01** |
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

The two sets on by default are the two weakest discriminators in the table, and
the three strongest are all candidates that are off.

## What fires only on AI

Ten rules hit AI prose and never touched a human document. These are the ones
carrying the tool.

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
the fourth independent confirmation that the em dash runs the wrong way, now on
fresh matched data, and the first from this project's own corpus. It stays: it
is a house-style rule and was never a detection claim.

## What this does not show

**The sample is small.** Eighteen pairs, about a thousand words each. A rule
firing on one document moves its share by six points.

**108 of 173 rules never fired at all.** On 34,000 words. Most of the library is
untested by this exercise rather than validated by it.

**The AI prose here is good.** It was written to a brief, by a capable model,
with real points to make. It is not the unedited output that gave slop its name.
So this measures whether the rules can separate good AI writing from good human
writing, which is the harder question and the right one for false positives, and
it understates how the rules do against actual slop.

**The human prose here is edited and published.** Gutenberg essays, peer
reviewed papers, wire copy. That is the best human writing, not the average.
Both corpora sit at the top of their distributions.

The honest reading is that these rules are weak evidence about authorship and
better used as what they were built for: flagging worn phrasing so a writer can
decide. The precision numbers matter more than the ratios, and on precision the
tight rules do well and a handful of loose ones do the damage.
