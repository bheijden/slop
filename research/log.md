# Mining log

Sources searched for AI-writing tells, what each yielded, and what was rejected.
Rules distilled from these live in [../candidates](../candidates), one set per
source.

## Contents

- Sources surveyed
- Per-source notes
- Rejected patterns and why
- The em-dash question

## Sources surveyed

| source | kind | yield |
|---|---|---|
| [awesome-slop](https://github.com/hwajongpark/awesome-slop) | curated index | the map for everything below |
| [slop-gate](https://github.com/hwajongpark/slop-gate) | CLI, JSON rules | vocabulary + punctuation packs |
| [slopster](https://github.com/t0ddharris/slopster) | Vale styles | reveal-shape openers, cross-sentence negation |
| [writinglint](https://github.com/NikhilVerma/writinglint) | NLP dependency rules | nothing — see below |
| [slop-cop](https://github.com/awnist/slop-cop) | in-browser detector | a limitation, not rules — see below |
| [antislop-sampler](https://github.com/sam-paech/antislop-sampler) | generation-time phrase list | 12 essay rules + 10 fiction rules |
| [EQ-Bench slop score](https://eqbench.com/slop-score.html) | leaderboard + word list | folded into antislop; weights not-X-but-Y at 25% |
| [Measuring AI "Slop" in Text](https://arxiv.org/abs/2509.19163) | paper, taxonomy | no rules — a coverage map, see below |
| [Excess vocabulary in LLM writing](https://pmc.ncbi.nlm.nih.gov/articles/PMC12219543/) | paper, 15M abstracts | pending |
| [LLM usage in scientific papers](https://www.nature.com/articles/s41562-025-02273-8) | paper, 1M+ papers | pending |
| [Ultimate AI Slop Word Blacklist](https://blog.atharvashah.com/p/the-ultimate-ai-slop-word-blacklist) | word list | pending |
| The Economist, AI writing in 2026 | report incl. red herrings | pending |
| [slop-forensics](https://github.com/sam-paech/slop-forensics) | per-domain n-gram lists | essay-domain trigrams, heavily topic-contaminated |
| [simonw tweet thread](https://x.com/simonw/status/2093277255438860358) | replies | structural tells; 3 further sources |
| [sloptells.com](https://sloptells.com) | measured against human baselines | 14 rules, and the em-dash verdict |
| [louisabraham word list](https://louisabraham.github.io) | banned-word list | pending — found via the thread |
| [marmbiz humanizer](https://github.com/marmbiz) | ~72 patterns, German | pending — found via the thread |

## Per-source notes

### slop-gate → [candidates/slop-gate.json](../candidates/slop-gate.json)

39 vocabulary rules and one punctuation rule. Eleven duplicated the shipped
sets and were dropped; 28 were converted. The duplicates:

<!-- slop-ignore-start -->
> delve, tapestry, meticulous, pivotal, vibrant, bustling, nestled, testament,
> worth-noting
<!-- slop-ignore-end -->

Converting them into a format that demands test examples exposed a flaw the
original does not check for: **18 of the 28 patterns broke on a double space or
an `&nbsp;`**, because they match a literal space between words. `\bcutting[- ]edge\b`
does not match `cutting&nbsp;edge`. Replacing every literal space with `\s+`
fixed all 18.

Two rules were too blunt to keep as written:

- `at the end of the day` fired on a real time of day (*"the batch runs at the
  end of the day"*). Narrowed to the sentence-initial discourse marker.
- `robust` and `crucial` are single ordinary words with no defensible miss
  example in engineering prose. Kept, flagged with a `note`, and left for
  calibration to judge.

Calibrated against 30k words of real technical writing: **3 findings**
(2 × `leverage`, 1 × `robust`), 0.1 per 1000 words. Precise on this corpus,
though that corpus is documentation rather than marketing register.

### simonw thread → structural tells

The replies converge on one point, from several people independently: the
vocabulary is the easy half.

<!-- slop-ignore-start -->

> The lexical ones are the easy 38. The stubborn tells are structural:
> rule-of-three lists, the not just X but Y frame, hedge-then-affirm. Those
> survive a synonym swap because the sentence skeleton is the watermark, not the
> vocabulary.

> The vocabulary is easy to prompt out. The harder tell to fix is the cadence:
> setup, neat contrast, tidy moral.

> the pattern that keeps getting stamped on my own drafts is the three-beat one.
> punchy opener, receipt, tidy closer. word lists miss it completely.

<!-- slop-ignore-end -->

Two further remarks worth carrying into the method:

<!-- slop-ignore-start -->
- One reply derived rules from 875 posts across five accounts: *"Cross checking
  against the other four killed 3 of them"* — five of eight rules survived. The
  same result the calibration method here produces, arrived at independently.
- *"A phrase can be stale in one paragraph and exact in another"* — an argument
  for reporting why a rule fired and letting the writer decide, which is what
  `suggest` and the hover card do.
<!-- slop-ignore-end -->

### antislop-sampler, slop-forensics, Slop Score → [candidates/antislop.json](../candidates/antislop.json) and [candidates/antislop-fiction.json](../candidates/antislop-fiction.json)

Sam Paech's three repositories are one lineage. The sampler suppresses phrases
at generation time, slop-forensics builds the lists by comparing model output
against human text, and the EQ-Bench Slop Score turns them into a leaderboard.
Together they are the largest published body of slop data: 2500 phrases, 2000
words, 358 essay trigrams, 430 creative-writing trigrams.

**Almost none of it transfers directly, for two separate reasons.**

The first is register. The headline lists are creative-writing artefacts. The
top entries are fantasy proper nouns and single verbs:

<!-- slop-ignore-start -->
`elara`, `kael`, `eldoria`, `oakhaven`, `whisperwood`, `zephyria`, `nodded`,
`whispered`, `flickered`, `rasped`, `thrummed`, `bioluminescent`
<!-- slop-ignore-end -->

None of that carries signal in documentation, and a linter that flags `nodded`
is worse than no linter.

The second reason is subtler and worth stating carefully, because it applies to
every over-representation list ever built. **N-gram frequency lists conflate
style with topic.** The essay-domain trigrams are topped by:

<!-- slop-ignore-start -->
`world war ii`, `world health organization`, `united arab emirates`,
`cognitive behavioral therapy`, `harvard business review`, `centers disease
control`, `abu dhabi`, `civil rights movement`
<!-- slop-ignore-end -->

Those are not tells. They are fingerprints of the prompt set — the essays were
about business, health and policy — and a human writing the same essays would
produce them at the same rate. They only look like slop because the human
baseline was not topic-matched. This is the exact failure sloptells avoids by
matching baselines to register, and it is the strongest argument in this log
for treating any raw frequency list as a lead rather than a finding.

**What survived both filters.** Stripping proper nouns and topic n-grams leaves
a residue of genuine constructions, and one of them is startling in its
frequency. The "significance inflation" shape appears in seventeen separate
inflections in the essay trigram list alone:

<!-- slop-ignore-start -->
extends far beyond · extend far beyond · extends beyond mere · far beyond
simple · far beyond mere · goes far beyond · extended far beyond · extending
far beyond · extend beyond individual · extends beyond individual · extend
beyond immediate · move beyond simply · must move beyond · moving beyond
simple · goes beyond simply · move beyond simplistic · beyond surface level
<!-- slop-ignore-end -->

That is one rule, not seventeen. The same collapse gave `another critical
aspect`, `this essay explores`, `requires a multi-faceted approach`, `provides
valuable insights`, `marked a significant turning point`, `a closer examination
reveals`, `inextricably linked`, and a stock-metaphor rule covering
double-edged sword, level playing field, virtuous cycle and one-size-fits-all.

**not-X-but-Y is their headline result, and it is worth taking seriously.** The
Slop Score weights it at 25% of the total, on its own, separate from the word
lists (60%) and trigrams (15%). No other construction gets its own component.
The sampler ships only three regexes in total and this is the first of them.

Their regex is `(?i)not [^.!?]{3,60} but`, which is unusable as a linter rule —
it fires on "I am not sure but I will check" and "he did not know but she did".
The difference is what `not` negates. When it negates a *nominal* the flip is
rhetorical; when it negates a *verb* the sentence is ordinary English. Without
part-of-speech tags the closest proxy is the word immediately after `not`:
requiring a determiner or preposition on both sides of `but` holds all four
test hits and drops all four verbal negations. It also stays clear of
wikipedia-ai's `not-just`, which already covers the qualified form.

The other two sampler regexes, `each(?:\s*\w+\s*|\s*)a` and the `every`
variant, are after the appositive cascade — "twelve panels, each a window into
another world". Kept, with a note: with no part-of-speech information a
descriptive appositive can still match.

**The fiction set is shipped separately and off by default.** The creative
constructions are real and consistent — voice barely above a whisper, heart
pounding in her chest, a shiver down her spine, the words hung in the air,
little did she know, maybe just maybe. Ten rules rather than 2500 phrases.
Anyone linting fiction wants these, and nobody linting documentation has any
use for them. That is what per-source sets are for.

### Measuring AI "Slop" in Text → no rules, but a coverage map

Shaib, Chakrabarty, Garcia-Olano and Wallace (arXiv 2509.19163, revised January
2026). This is a measurement paper, not a phrase source. It builds a taxonomy
from interviews with 19 experts, then has professional copy-editors annotate
slop spans across 150 news articles and 100 QA passages.

It yields no rules. What it yields is an honest map of where a linter like this
one can reach, which is worth more. Eleven codes under three themes:

| code | what it is | reachable here? |
|---|---|---|
| IU1 Density | substantive content per word | only as a document-level rate |
| IU2 Relevance | alignment with the task | no |
| IQ1 Factuality | inaccuracies, fabrications | no |
| IQ2 Bias | missing or flattened perspective | no |
| SQ1 Repetition | same words and phrases reused | **yes** — `echo`, `anaphora` |
| SQ2 Templatedness | formulaic syntactic structures | **yes** — every regex rule here |
| SQ3 Coherence | does it follow logically | no |
| SQ4 Fluency | natural turns of phrase | no |
| SQ5 Verbosity | passage and sentence length | as a rate, not a span |
| SQ6 Word Complexity | needless jargon and rare words | partly — lexicon rules |
| SQ7 Tone | register fit for the context | partly — promo and uplift rules |

Five of eleven are out of reach, and the paper says they are out of reach for
everyone: they "require human annotations due to the complexity of automated
factual evaluations", and for coherence and fluency there is an "absence of
reliable automatic measurements".

The paper's own negative results are the reassuring part. Standard text metrics
fail to capture annotator preferences, capable reasoning models fail to
reliably extract slop spans, and the authors close by saying "fully automated
and scalable methods remain an open challenge". Nobody has a good automatic
method. That makes a transparent, testable, per-rule linter a defensible place
to stand — provided it claims SQ1 and SQ2 and stays quiet about the rest.

Two further notes. Its Templatedness example is a *repeated appositive frame*
("Dr. Smith, a researcher at Oxford University, found that... Professor
Johnson, a scientist at Cambridge University, discovered that..."), which is
close to the `anaphora` detector but keyed on an internal frame rather than a
sentence head. Worth prototyping. And its Density code is the fourth
independent argument for a document-level rate detector, after sloptells'
slopIndex, slopster's Vale `occurrence`, and the sampler's own `slop_index.py`,
which computes weighted matches per thousand words — the same unit this CLI
already reports.

## The em-dash question

**A per-occurrence rule cannot work.** slop-gate ships `{"id": "em-dash",
"match": "—"}`, matching every one.

Measured over 19k words of real writing:

| | |
|---|---|
| em-dashes | 273 |
| rate | 14.4 per 1000 words |
| documents at 15–29 per 1000 | 9 |
| documents at zero | 6 |
| spaced ` — ` | 273 (100%) |
| tight `word—word` | 0 |

The distribution is **bimodal**: a document either uses them constantly or not
at all. That is a property of the document's style, not of any one sentence, and
a per-match rule turns it into 84 findings in a single file.

Sampling 276 contexts, almost all are ordinary appositive or parenthetical use.
Only **16%** are followed by *and / but / not / no* — the reversal construction,
which the shipped `not-just` and `stranded-auxiliary` rules already reach.

So there are two honest options, and neither is a regex over a span:

1. **A `density` detector kind** reporting once per document above a threshold,
   like `--max-per-1000` but per rule. This is the shape the signal actually has.
2. **Flag only the constructions**, not the character — which is already done.

Recommendation: do not ship a per-occurrence em-dash rule. Build the `density`
kind, calibrate a threshold against human-written corpora, and let the em-dash be
its first user.

### sloptells → [candidates/sloptells.json](../candidates/sloptells.json)

The best source found so far, and the only one that measures. It generates text
from current and older models on prompts matched to pre-AI human writing, finds
what models overuse, **checks every candidate against acclaimed human prose so it
does not flag good writers**, dates each tell, and tracks a lifecycle from
emerging through active, saturated, fading, stale and retired. The copy fetched
was generated the same day.

Each tell carries a measured rate, a human baseline rate, and a `collateral`
rating — its own false-positive risk. 14 of 38 were taken. A tell had to be active or saturated, rated low
collateral, and expressible as a pattern. Formatting and cadence tells
(bold everywhere, emoji as structure, sentences that march in formation) are not
reachable by a regex over spans. Everything rated medium or high collateral was
left out, which is where `not just`, `especially`, `in practice` and `signposting`
went.

The highest-ratio tells it measures:

| tell | vs humans |
|---|---|
| genuinely | ×53 |
| the real question/issue | ×30 |
| That said, … | ×19 |
| here's what … | ×18 |
| one of those X | ×12 |
| (this) feels like | ×12 |

**Its retired list matters to this project.**
<!-- slop-ignore-start -->
sloptells has retired `delve`, `tapestry` and `a testament to` — models stopped
using them — and all three are live in the shipped `simonwillison` set.
<!-- slop-ignore-end --> Also retired: staccato mic-drop
sentences, refuted by measurement. That is a calibration question for a later
pass, not a change to make blind.

### writinglint → nothing

Its `experiments/rule-sensitivity/RESULTS.md` is a dependency-parser training
result — BERT-Mini distilled from DeBERTa, rule-aware token weighting, UD English
EWT scores. Real work, but about their NLP infrastructure rather than which
prose rules hold up. No transferable rules.

### slop-cop → a limitation, not rules

Its detectors run `compromise` for part-of-speech context, and say why:

> NLP-assisted detectors for context-sensitive slop words — cases where simple
> word matching produces too many false positives.

<!-- slop-ignore-start -->
The words it treats this way are `leverage`, `harness`, `foster`, `underscore`,
`navigate`, `streamline`, `spearhead`, `craft`, `bolster`, `emphasize`: all
ordinary verbs whose slop-ness depends on grammatical role.
<!-- slop-ignore-end --> This engine is regex
over spans and cannot make that distinction. Worth recording as a known ceiling.

## Calibration so far

Against 30k words of real technical writing, and against a synthetic slop
paragraph as a positive control:

| set | rules | on real prose | on synthetic slop |
|---|---|---|---|
| slop-gate | 28 | 3 findings, 0.1/1k | 6 |
| slopster | 7 | 0 findings | 6 |
| sloptells | 14 | 35 findings, 1.16/1k | — |

slopster firing zero on the corpus and six on the synthetic sample is the
behaviour to want: its reveal-shape openers do not occur in technical
documentation.

sloptells' 35 are almost all two rules: `rather-than` (17) and `genuinely` (13).
Both are rated low collateral by sloptells — **but their baselines are Hacker
News, cooking and parenting registers, and this corpus is engineering
documentation**, where "rather than" is ordinary English. A tell's collateral is
register-dependent, and a rating measured on one register does not transfer.

One caveat on the other side: parts of that corpus were probably drafted with an
assistant, so some of those 13 `genuinely` hits may be true positives rather than
noise. Calibrating against prose of known provenance is the honest next step.
