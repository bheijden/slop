# Mining log

Sources searched for AI-writing tells, what each yielded, and what was turned down.
Rules distilled from these live in [../candidates](../candidates), one set per
source.

## Contents

- Sources surveyed
- Per-source notes
- Turned down patterns and why
- The em-dash question

## The semicolon (2026-09-01)

A reader reported that AI overuses the semicolon. The rate does not show it. On
the 36-document audit corpus AI runs 4.87 per 1000 words against 3.61 for human,
a ratio of 1.35, and the human maximum of 24.7 is well above the AI maximum of
15.9. Human use is bimodal. Nine of eighteen human documents contain no
semicolon at all, and three contain almost all of them.

Splitting the genre-matched corpus explains why. In literary prose the two are
inseparable, 15.0 per 1000 words against 14.8. Every gap is elsewhere.
Across technical documentation and government prose, no human document uses a
semicolon and five of six AI documents do. So the reader is right about what
they saw, but the mechanism is register and not volume, and a rate rule
would report the human essayists and miss the AI technical writing.

Four constructions were measured per document against both collections.

| pattern | human | AI | kept |
|---|---|---|---|
| negation, semicolon, correction | 0/18 | 7/18 | yes |
| two or more semicolons in one sentence | 0/18 | 7/18 | no, see below |
| "Some X; others Y" | 0/18 | 2/18 | no, two occurrences |
| "; it/they &lt;verb&gt;" | 3/18 | 5/18 | no, too weak |

The first two both measured 0 of 18 human documents, which the 18-document corpus
was too small to distinguish. Against 176,000 further words of human academic
papers, wire copy and product writing, the semicolon series fired on 19 of 35
news documents and 5 of 14 papers; the correction pattern fired twice in the
whole 176,000 words. The series is how a human journalist writes a list, and
only the small corpus made it look otherwise.

`semicolon-correction` ships. Verbal negation is required, because the three
human matches on a looser draft were all the determiner: "no longer upright;
he", "no reference to former roses; they", "no such pipes; the".


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
| [Measuring AI "Slop" in Text](https://arxiv.org/abs/2509.19163) | paper, taxonomy | a coverage map, and eventually one rule |
| [Excess vocabulary in LLM writing](https://pmc.ncbi.nlm.nih.gov/articles/PMC12219543/) | paper, 15M abstracts | no rules — it proves the style/topic split |
| [LLM usage in scientific papers](https://www.nature.com/articles/s41562-025-02273-8) | paper, 1M+ papers | pending |
| [Ultimate AI Slop Word Blacklist](https://blog.atharvashah.com/p/the-ultimate-ai-slop-word-blacklist) | word list | nothing — downstream of antislop-sampler |
| [The Economist, How to Spot AI Writing](https://www.economist.com/culture/2026/07/30/how-to-spot-ai-writing) | 55,940 sentences vs 4 models | 6 density rules, and the em dash killed a third time |
| [slop-forensics](https://github.com/sam-paech/slop-forensics) | per-domain n-gram lists | essay-domain trigrams, heavily topic-contaminated |
| [simonw tweet thread](https://x.com/simonw/status/2093277255438860358) | replies | structural tells; 3 further sources |
| [sloptells.com](https://sloptells.com) | measured against human baselines | 14 rules, and the em-dash verdict |
| balanced semicolon antithesis | reader report | nothing, and the negative is recorded below |
| [louisabraham](https://louisabraham.github.io) | banned-word list | not found — no such article on the site |
| [humanizer-de](https://github.com/marmbiz/humanizer-de) | 72 patterns, German | 2 rules, including sentence-length variation |

## Per-source notes

### slop-gate → [candidates/slop-gate.json](../candidates/slop-gate.json)

39 vocabulary rules and one punctuation rule. Eleven duplicated the shipped
sets and were cut; 28 were converted. The duplicates:

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
  end of the day"*). Tightened to the sentence-initial discourse marker.
<!-- slop-ignore-start -->
- `robust` and `crucial` are single ordinary words with no justifiable miss
<!-- slop-ignore-end -->
  example in engineering prose. Kept, flagged with a `note`, and left for
  calibration to assess.

Calibrated against 30k words of real technical writing: **3 findings**
<!-- slop-ignore-start -->
(2 × `leverage`, 1 × `robust`), 0.1 per 1000 words. Precise on this corpus,
<!-- slop-ignore-end -->
though that corpus is documentation, not marketing register.

### simonw thread → structural tells

The replies agree on one point, from several people independently. The
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
  against the other four killed 3 of them"* — five of eight rules came through. The
  same result the calibration method here produces, reached independently.
- *"A phrase can be stale in one paragraph and exact in another"* — an argument
  for reporting why a rule fired and letting the writer decide, which is what
  `suggest` and the hover card do.
<!-- slop-ignore-end -->

### antislop-sampler, slop-forensics, Slop Score → [candidates/antislop.json](../candidates/antislop.json) and [candidates/antislop-fiction.json](../candidates/antislop-fiction.json)

Sam Paech's three repositories are one lineage. The sampler blocks phrases
at generation time, slop-forensics builds the lists by comparing model output
against human text, and the EQ-Bench Slop Score turns them into a leaderboard.
Together they are the largest published body of slop data: 2500 phrases, 2000
words, 358 essay trigrams, 430 creative-writing trigrams.

**Almost none of it transfers directly, for two separate reasons.**

The first is register. The summary lists are creative-writing artefacts. The
top entries are fantasy proper nouns and single verbs:

<!-- slop-ignore-start -->
`elara`, `kael`, `eldoria`, `oakhaven`, `whisperwood`, `zephyria`, `nodded`,
`whispered`, `flickered`, `rasped`, `thrummed`, `bioluminescent`
<!-- slop-ignore-end -->

None of that carries signal in documentation, and a linter that flags `nodded`
is poorer than no linter.

The second reason is subtler and worth setting out carefully, because it applies to
every over-representation list ever built. **N-gram frequency lists conflate
style with topic.** The essay-domain trigrams are topped by:

<!-- slop-ignore-start -->
`world war ii`, `world health organization`, `united arab emirates`,
`cognitive behavioral therapy`, `harvard business review`, `centers disease
control`, `abu dhabi`, `civil rights movement`
<!-- slop-ignore-end -->

Those are not tells. They are fingerprints of the prompt set. The essays were
about business, health and policy, and a human writing the same essays would
produce them at the same rate. They only look like slop because the human
baseline was not topic-matched. This is the exact failure sloptells avoids by
matching baselines to register, and it is the strongest argument in this log
for treating any raw frequency list as a lead , not a finding.

**What came through both filters.** Stripping proper nouns and topic n-grams leave
a remainder of real constructions, and one of them is startling in its
frequency. The "significance inflation" shape appears in seventeen separate
inflections in the essay trigram list alone:

<!-- slop-ignore-start -->
extends far beyond · extend far beyond · extends beyond mere · far beyond
simple · far beyond mere · goes far beyond · extended far beyond · extending
far beyond · extend beyond individual · extends beyond individual · extend
beyond immediate · move beyond simply · must move beyond · moving beyond
simple · goes beyond simply · move beyond simplistic · beyond surface level
<!-- slop-ignore-end -->

That is one rule, not seventeen. The same collapse produced `another critical
aspect`, `this essay explores`, `requires a multi-faceted approach`, `provides
valuable insights`, `marked a significant turning point`, `a closer examination
reveals`, `inextricably linked`, and a stock-metaphor rule covering
double-edged sword, level playing field, virtuous cycle and one-size-fits-all.

**not-X-but-Y is their summary result, and it is worth taking seriously.** The
Slop Score weights it at 25% of the total, on its own, separate from the word
lists (60%) and trigrams (15%). No other construction gets its own component.
The sampler ships only three regexes in total and this is the first of them.

Their regex is `(?i)not [^.!?]{3,60} but`, which cannot be used as a linter rule,
it fires on "I am not sure but I will check" and "he did not know but she did".
The difference is what `not` negates. When it negates a *nominal* the turn is
rhetorical; when it negates a *verb* the sentence is ordinary English. Without
part-of-speech tags the closest proxy is the word immediately after `not`.
requiring a determiner or preposition at each end of `but` retains all four
test hits and skips all four verbal negations. It also remains clear of
wikipedia-ai's `not-just`, which already covers the qualified form.

The other two sampler regexes, `each(?:\s*\w+\s*|\s*)a` and the `every`
<!-- slop-ignore-start -->
variant, are after the appositive cascade, as in "twelve panels, each a window into
<!-- slop-ignore-end -->
another world". Kept, with a note. With no part-of-speech information a
descriptive appositive can still match.

**The fiction rules ship on.** The creative constructions are real and
<!-- slop-ignore-start -->
consistent: voice barely above a whisper, heart pounding in her chest, a shiver
down her spine, the words hung in the air, little did she know, maybe just
maybe. Ten rules, not 2500 phrases.
<!-- slop-ignore-end -->
They were off by default at first, on the reasoning that nobody linting
documentation has any use for them. That was the wrong test. A rule that does
not fire on your register costs nothing to leave on, and the point is removing
tics and not matching a distribution, so a tell that is only ever going to
report nothing on your prose is not worth making anyone opt into. Measured against
the 29k-word human technical corpus the ten fire zero times; the only hits in
this repo are the sentence above, which names the patterns.

### Measuring AI "Slop" in Text → no rules, but a coverage map

Shaib, Chakrabarty, Garcia-Olano and Wallace (arXiv 2509.19163, revised January
2026). This is a measurement paper, not a phrase source. It builds a taxonomy
from interviews with 19 experts, then has professional copy-editors annotate
slop spans across 150 news articles and 100 QA passages.

It produces no rules. What it produces is an honest map of where a linter like this
one can reach, which is worth more. Eleven codes under three themes:

| code | what it is | reachable here? |
|---|---|---|
| IU1 Density | content words per word | only as a document-level rate |
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
everyone, who "require human annotations due to the complexity of automated
factual evaluations", and for coherence and fluency there is an "absence of
reliable automatic measurements".

The paper's own negative results are the reassuring part. Standard text metrics
fail to capture annotator preferences, capable reasoning models fail to
reliably extract slop spans, and the authors close with "fully automated
and scalable methods remain an open challenge". Nobody has a good automatic
method. That makes a transparent, testable, per-rule linter a justifiable place
to stand, provided it claims SQ1 and SQ2 and says nothing about the rest.

Two further notes. Its Templatedness example is a *repeated appositive frame*
("Dr. Smith, a researcher at Oxford University, found that... Professor
Johnson, a scientist at Cambridge University, discovered that..."), which is
close to the `anaphora` detector but built on an internal frame and not a
sentence head. Worth prototyping. And its Density code is the fourth
independent argument for a document-level rate detector, after sloptells'
slopIndex, slopster's Vale `occurrence`, and the sampler's own `slop_index.py`,
which computes weighted matches per thousand words, the same unit this CLI
already reports.

### Excess vocabulary in 15.1M PubMed abstracts → no rules, but the control everyone else lacked

Kobak, González-Márquez, Horvát and Lause. 15.1 million abstracts, 2010–2024.
The method is borrowed from excess-mortality epidemiology. Take 2021–2022 word
frequencies, extrapolate them forward, and measure what 2024 actually did
against that counterfactual. It requires neither marked data nor a trained model, and
it has a real pre-ChatGPT baseline over the *same corpus*, which is the
control every n-gram list in this log was missing.

The summary numbers are ratios against the counterfactual:

<!-- slop-ignore-start -->
| word | r |
|---|---|
| delves | 28.0 |
| underscores | 13.8 |
| showcasing | 10.7 |
<!-- slop-ignore-end -->

**Its most useful result is not the word list, it is the split.** The paper
separates style words from content words and then makes the comparison that
resolves the question this log kept running into. In 2024, excess vocabulary was
"almost entirely style words": 45.2% style against 51.3% content overall, and
among the style words 66% were verbs. During COVID, excess vocabulary was
almost entirely *content* words, such as coronavirus, covid, lockdown, pandemic, at
r > 1000.

That is the style/topic distinction demonstrated and not claimed, on the same
corpus with the same method, and it is the reason the slop-forensics essay
trigrams could be dismissed, since their excess vocabulary looks like the COVID
column, not the 2024 one.

No rules come out of it. Every one of its style words is already covered by the
shipped `ai-vocab` rule or the slop-gate candidate, and the register is
biomedical abstracts. What it does contribute is a warning about going out of date.
<!-- slop-ignore-start -->
This is 2024 data, `delves` is its single strongest signal at r = 28.0, and
sloptells has since retired `delve` as a tell that models stopped using.
<!-- slop-ignore-end -->
Two excellent sources, three years between them, flatly at odds about the same
word. That conflict is why the retired-tell calibration is still open.

### Ultimate AI Slop Word Blacklist → nothing

About 1500 entries across unigrams, bigrams and trigrams, aimed at "GPT-5.2
and the models running now, in 2026". The unigram list is full of fantasy
proper nouns and genre vocabulary, which places it downstream of the
antislop-sampler lists and inherits their register problem entire.

The author's own workflow is the tell: "a piece does not leave my drafts folder
until it hits zero flags." A 1500-entry blacklist at zero tolerance is not a
linter, it is a thesaurus constraint, and it is the failure mode this project is
built to avoid. Nothing taken.

### The Economist, "How to Spot AI Writing" → [candidates/economist.json](../candidates/economist.json)

Published 30 July 2026. The best-controlled source in this log, with four models
were prompted to rewrite Economist articles from summaries, with no web access,
and the output was compared against the paper's own journalism, CNN, the New
York Times, the Washington Post, and novels published between 1950 and 2022.
55,940 sentences and 1.2 million words.

**The em dash fails a third time.** Only Claude used more em dashes than human
writers; ChatGPT used markedly fewer. That is now three independent
measurements in accord. sloptells measured against acclaimed human prose, this
project against its own corpus, and the Economist against journalism and
novels, and they agree in the direction reverse to the folklore.

**What it found instead is almost all rates.** Latinate suffixes and
polysyllables; nominalisations, favoured by all four models; long sentences
with few short ones; "and" as the most overused word; rule-of-three
constructions and the not-X-but-Y turn; and, most surprisingly, **punctuation
scarcity**, with fewer commas, fewer semicolons, "hardly any parentheses". Also
that the models do not quote experts, which is a journalism-specific tell and
was left out.

Almost none of that is a span. It is why this iteration implemented the
`density` detector kind instead of writing more regexes, a 6th kind that
reports a rate per 1000 words for the document as a whole, with `min` for
pile-up and `max` for scarcity.

**The prose gate exists because the first calibration run was a disaster.**
Scarcity rules over a real directory immediately flagged a config dump, a CSV
and two HTML diffs, all of which have zero commas, zero parentheses and zero
sentence endings, and none of which are prose. A rate over something that is
not prose is meaningless. Density rules now require a minimum word count, a
minimum number of sentences, and a mean sentence length in a believable range
before they will evaluate anything at all.

**Thresholds came from measurement, not from taste.** Sixteen documents in the
corpus survive that gate; here is what human technical prose actually does,
per 1000 words:

| metric | min | median | max | threshold | fires on |
|---|---|---|---|---|---|
| commas | 21.6 | 41.5 | 79.1 | ≤ 20 | 0 of 16 |
| parentheses | 0 | 47.7 | 110.3 | = 0 | 1 of 16 |
| sentence endings | 17.3 | 45.2 | 75.0 | ≤ 20 | 2 of 16 |
| nominalisations | 14.2 | 30.2 | 94.6 | ≥ 70 | 1 of 16 |
| tricolons | 0 | 0 | 3.1 | ≥ 8 | 0 of 16 |
| em dashes | 0 | 16.3 | 55.2 | ≥ 35 | 1 of 16 |

Six findings across 35 files, 0.2 per 1000 words. Each threshold sits at or
beyond the edge of the observed human distribution, so the set says something
only about documents at the far end. That is the honest limit of a rate.

**One half of the calibration is missing and should remain visible.** There is no
AI-written corpus here, so every threshold is derived from the human side
alone. `comma-scarcity` in particular is a lower bound beneath observed human writing,
not a ceiling measured on model output. The Economist has the numbers that
would close this; they are not published in a form that can be reused.

The em-dash rule ships with its description leading on the word NOT. It is not
an AI tell, it never was, and the only honest thing a rate can say about em
dashes is that beyond some density they have stopped doing any work, whoever
wrote them. That is worth keeping as a style rule and worth declining to dress
up as detection.

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

The distribution is **bimodal**. A document either uses them constantly or not
at all. That is a property of the document's style, not of any one sentence, and
a per-match rule turns it into 84 findings in a single file.

Sampling 276 contexts, almost all are ordinary appositive or parenthetical use.
Only **16%** are followed by *and / but / not / no*, the reversal construction,
which the shipped `not-just` and `stranded-auxiliary` rules already reach.

So as a *detection* signal there are two honest options, and neither one is a
regex over a span:

1. **A `density` detector kind** reporting once per document above a threshold,
   like `--max-per-1000` but per rule. This is the shape the signal actually has.
2. **Flag only the constructions**, not the character, which is already done.

Both were built. The density kind ships as `em-dash-density` in the economist
candidate set, and the constructions were already covered.

### But detection was the wrong question

Everything above resolves "does an em dash tell you a machine wrote this?" The
answer is no, four times over. What it does not answer is "do I want em dashes
in my own writing?", and that question is the writer's, not the
evidence.

This project's owner does not want them. So `rules/em-dash.json` ships a
per-occurrence rule, on by default, marking every one. It is recorded as house
style and its `measured` field states in plain terms that the research says the
reverse about detection, so nobody mistakes a hit for evidence of authorship.

The two claims rest together without conflict:

| question | answer |
|---|---|
| Does an em dash indicate AI wrote it? | No. Human prose uses more of them. |
| Should this repo's prose contain any? | No, because its owner says so. |

The rule was then turned on the repo, which had 78 of them. All 78 are
removed, recast as commas, colons, brackets or full stops, across the README,
every doc, the skill, the web page and this log. The CLI's own output no longer
prints one either, since a tool that flags em dashes should not emit them. The
only ones left in the source are regex character classes, the HTML entity table,
and the test fixtures that exist to be flagged.

That cleanup is the strongest evidence available that the rule is livable. A
7,600-word technical repository, written by someone who reaches for the em dash
constantly, says no poorer without a single one.

### sloptells → [candidates/sloptells.json](../candidates/sloptells.json)

The best source found so far, and the only one that measures. It generates text
from current and older models on prompts matched to pre-AI human writing, finds
what models overuse, **checks every candidate against acclaimed human prose so it
does not flag good writers**, dates each tell, and tracks a lifecycle from
emerging through active, full, fading, stale and retired. The copy fetched
was generated the same day.

Each tell carries a measured rate, a human baseline rate, and a `collateral`
rating, its own false-positive risk. 14 of 38 were taken. A tell had to be active or full, rated low
collateral, and expressible as a pattern. Formatting and rhythm tells
(bold throughout, emoji as structure, sentences that march in formation) are not
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

**Its retired list is relevant to this project.**
<!-- slop-ignore-start -->
sloptells has retired `delve`, `tapestry` and `a testament to` — models stopped
using them — and all three are live in the shipped `simonwillison` set.
<!-- slop-ignore-end -->
Also retired, the staccato mic-drop
sentences, disproved by measurement. That is a calibration question for a later
pass, not a change to make unseen.

### writinglint → nothing

Its `experiments/rule-sensitivity/RESULTS.md` is a dependency-parser training
result: BERT-Mini distilled from DeBERTa, rule-aware token weighting, UD English
EWT scores. Real work, but about their NLP infrastructure and not which
prose rules survive. No transferable rules.

### slop-cop → a limitation, not rules

Its detectors run `compromise` for part-of-speech context, and say why:

> NLP-assisted detectors for context-sensitive slop words, cases where simple
> word matching produces too many false positives.

<!-- slop-ignore-start -->
The words it treats this way are `leverage`, `harness`, `foster`, `underscore`,
`navigate`, `streamline`, `spearhead`, `craft`, `bolster`, `emphasize`: all
ordinary verbs whose slop-ness depends on grammatical role.
<!-- slop-ignore-end -->
This engine is regex
over spans and cannot make that distinction. Worth recording as a known ceiling.

### humanizer-de → [candidates/humanizer-de.json](../candidates/humanizer-de.json)

A German AI-text auditor built as a Claude Code and Codex skill: 72 patterns, a
117KB pattern catalogue, an evidence ledger, a coverage matrix, and a
false-positive corpus report. The most methodologically serious project in this
log after sloptells, and it reaches the same method from a different
language.

Most of the catalogue does not transfer. Modal particles, `„Text”` quotation
imbalance, Konjunktiv register are German problems. The
English-transferable patterns it names were already covered here, being vague
authorities by `vague-experts`, negative parallelism by `not-just`, section
summaries by `in-conclusion`, rote connectives by `moreover`, rule of
three by `triad-density`.

**Its governing rule appears in bold at the top of its own checklist, and it
is the sentence this whole log retains converging on.** *Grundregel: Cluster
zählen, nicht Einzelsignale*, meaning count clusters, not single signals. A single em
dash, it says, proves nothing at all. That is the fourth independent source to
kill the em dash and a 5th to argue for rates over occurrences.

**What it contributes that nothing else did is a measurement.** Its
`style-targets.json` requires `stddev_mean_ratio` of at least 0.4 in every
register profile it ships, the coefficient of variation of sentence length.
Prose where every sentence is the same length is correct, readable, and
metrically monotone. That is tell 10 in their checklist, and the thing sloptells
describes as sentences that march in formation.

That needed a seventh detector kind, `rhythm`, because it is a statistic over a
distribution, not a count of anything. Their German threshold transfers
cleanly. Sixteen documents of English human technical prose measured 0.49 to
1.54, so 0.4 sits below all of them.

The second rule is their paired-aside cluster. What it counts is not the em
dash but `— like this —` as a repeated shape, per thousand words. The corpus topped out
at 3.6, so the threshold is 6.

Both rules find nothing in 30,300 words of human prose.

One rejection worth recording, because it is a red herring found by someone
else. They note that upright quotes throughout a document are a CMS artefact
rather than an AI signal. Typography is not evidence.

### louisabraham → not found

The thread sent readers here for a banned-word list. The site's article index has
nothing on AI writing, word lists or prose. Either it was removed or the
reference was wrong. Recorded so nobody repeats the search.

## The retired-tell question, resolved

Three sources, three years, apparently in flat conflict:

<!-- slop-ignore-start -->
- The PubMed excess-vocabulary study places `delves` at r = 28.0 in 2024 — its
  single strongest style signal out of 15.1 million abstracts.
- sloptells, measuring current models in 2026, has retired `delve`, `tapestry`
  and `a testament to` as tells models no longer produce.
- Both are shipped live here, in `wikipedia-ai`'s `ai-vocab` and `testament`.
<!-- slop-ignore-end -->

**They are not actually at odds.** They measured different years. The word was
the strongest tell of 2024 *and* has since been trained out. Both statements
are true, and the apparent conflict is an artefact of reading two undated
measurements as if they were claims about the present.

So the question is not which source is right. It is what a linter should do
with a tell whose recall has decayed. That depends entirely on collateral, so
the collateral was measured over 43,479 words of human technical prose:

| | hits |
|---|---|
| the whole `ai-vocab` rule | 1 |
| the retired trio | **0** |

Zero. Nobody reaches for these words by chance in technical writing.

**Verdict, keep them and date them.** Removing a rule with zero collateral
adds nothing and gives up coverage of everything written by the models that did
produce it, which is a great deal of text still on the internet. The argument
for removal was about recall, and recall costs the reader nothing; precision is
what costs them.

<!-- slop-ignore-start -->
What was wrong was not the rules but the silence. A rule that exists because of
<!-- slop-ignore-end -->
a 2024 measurement should say so. Two changes, both data only:

- Rules may now carry a `measured` field recording when a tell was measured and
  by whom, and `ai-vocab` and `testament` carry one.
- `slop explain` prints `measured` and `note`. `note` was already used by
  several candidate rules and had never been shown to anyone, which was a plain
  bug.

The general lesson is worth keeping in view for every set in this log. **A
tell's value depends on the age of the text being linted, not only on the age
of the measurement.** Someone checking their own draft now gets nothing from
a retired tell. Someone auditing an archive gets a great deal.

### The structural tells, and the two that could not be built

Four shapes were named across the thread and sloptells, none of them phrases.
Two turned into rules and two did not, and the failures are the more useful half.

<!-- slop-ignore-start -->
**Hedge, then affirm.** "It's not perfect, but it works." A weakness admitted in
<!-- slop-ignore-end -->
a subordinate clause and immediately overridden, so the reader gets the feeling
of balance and none of the information. This is a span, and it is separabhable
from the ordinary not-X-but-Y turn by what follows `but`, which is a clause with a subject
pronoun and not a parallel noun phrase. Shipped in
[candidates/structural.json](../candidates/structural.json).

<!-- slop-ignore-start -->
**The rhetorical self-interview.** "Is it perfect? No. Does it work? Yes." A
<!-- slop-ignore-end -->
question nobody raised, resolved in one word. Also a span, also shipped. It sits
next to the existing `stacked-questions` rule, which counts question runs without
caring how they are resolved.

**Sentences that march in formation** turned out to be measurable after all, but
not here, because humanizer-de had already reduced it to sentence-length variation, and
it ships as `uniform-sentence-length`.

**The mic-drop closer was not built, on purpose.** A very short emphatic
sentence after a run of long ones is a real tell in aggregate and completely
inseparable from good writing in the particular. Hemingway does it, every
decent essayist does it, and the shape carries no information about who wrote
it. Position awareness would be easy to add, since blocks are newline-separated
and the last sentence of a block can be located. The reason not to is that the
false-positive rate would be enormous and the rule would be marking craft.

**Setup, contrast, moral was not built either**, for a different reason. It is a
description of an argument, not of a pattern. Every paragraph that states a
position, complicates it and reaches a conclusion has this form, which is to say
every well-constructed paragraph. There is nothing to match that is not also the
thing you want people to do.

### arXiv 2509.19163, second pass → [candidates/arxiv-slop.json](../candidates/arxiv-slop.json)

The first pass concluded the paper produces no rules. That was half right. Five of
<!-- slop-ignore-start -->
its eleven codes are genuinely out of reach, but SQ2 Templatedness is the one it
<!-- slop-ignore-end -->
says is mechanisable, measured "via syntactic structures", and its own worked
example is a run of appositive frames:

<!-- slop-ignore-start -->
> Dr. Smith, a researcher at Oxford University, found that... Professor Johnson,
> a scientist at Cambridge University, discovered that... Dr. Williams, an expert
> at Yale University, confirmed that...
<!-- slop-ignore-end -->

Run that through every rule in this project and nothing fires. **`echo` cannot
see it**, because `echo` looks for repeated words and every content word here
changes. What repeats is the form.

So content words are wildcarded and only the closed class is compared, giving
each sentence a signature like `_ _ , a _ at _ _`. Runs of three or more
consecutive sentences sharing a signature are the finding. That is the eighth
detector kind, `frame`, and it is a crude substitute for the part-of-speech
tagging the engine does not have.

Getting it to work took three guards, and each one came from a failure:

1. **Abbreviations.** The first version did not fire on the paper's own example,
   because splitting on `[.!?]` turns "Dr. Smith" into two sentences. Abbreviation
   full stops are now masked with a same-length placeholder before the split, so
   every offset remains valid.
2. **One allomorph.** The second version still did not fire, because two
   sentences signed `_ _ , a _ at _ _` and one signed `_ _ , an _ at _ _`. The
   determiner is the same word. Normalising `an` to `a` fixed it, and the fact
   that a single phonological variant broke the whole method is worth
   recalling about how brittle this family of technique is.
3. **Code.** With those fixed it found two false positives in 30,300 words, both
   runs of pasted Python. Repeated code lines *are* templated, for good reason, and
   they carry enough function words to pass an anchor check. Frames are now only
   compared between sentences that look like prose, with no code punctuation, mostly
   letters. That is the same trick the `colon-triple` rule uses.

Final result, it fires on the paper's example, fires on synthetic templated prose, zero
findings in 30,300 words of human technical writing.

### Three extraction bugs, found by turning a rule on

The em-dash rule was the first rule to match something on nearly every line,
which made it an accidental fuzzer for the extractor. It found three bugs that
every previous rule had been too sparse to reveal:

1. **Ignore markers were obeyed inside inline code.** A line reading
   ``` `<!-- slop-ignore-start -->` and `<!-- slop-ignore-end -->` ``` in the
   documentation *for the feature* turned ignoring on for real. Markers now have
   to be alone on their line, which is also how every other linter's disable
   comments behave.
2. **A line with both markers stuck.** The start test ran first and
   `continue`d, so the end marker on that line was never read and the region stayed
   open to the end of the file.
3. **An inline triple backtick opened a fenced block.** The README's own Limits
   section demonstrates a code span containing backticks, written
   ``` `retry_count` is deprecated ``` on one line. CommonMark says the info
   string of a backtick fence may not contain a backtick; the extractor did not
   check, so it opened a fence and consumed the last 600 characters of
   the README, including two em dashes and a stranded auxiliary.

Bug 3 is the important one. Any markdown file that documents backtick code
spans that way was having its remainder cut, under every rule, since the
beginning.

<!-- slop-ignore-start -->
A fourth problem was not a bug but a gap. The repo's own `slop.json` pins
<!-- slop-ignore-end -->
`select` to two sets, so the new `em-dash` set was excluded from `check -r .`
and from CI, while a cleanup run from `--select em-dash` made the repo look
clean. Config that names sets explicitly does not pick up new ones. The select
list now includes it.

### Balanced semicolon antithesis, tested and turned down

Proposed from a real reading: "the mechanics are in the appendix; the
consequences are what count" says like a machine, and the shape generalises to
*the X is Y; the Z is W*. It is a recognisable rhetorical tic and worth a
measurement.

Four formulations were tallied over the 36-document matched corpus.

| pattern | human | AI |
|---|---|---|
| `the X is Y; the Z is W`, the exact shape | 0 | 0 |
| same word opening both halves of a semicolon | 7 | 17 |
| semicolon followed by determiner, noun, copula | 0 | 0 |
| a copula on both sides of a semicolon | 5 | 10 |

**The exact shape does not occur at all**, in 34,000 words of either corpus. It
is too rare to certify from data this size.

The looser forms separate no better. Per document the counts are 0 in fifteen times
then 1, 2, 4 for human writing, and 0 ten times then 1, 1, 1, 1, 2, 3, 3, 5 for
AI. Human maximum four, AI maximum five.

<!-- slop-ignore-start -->
And what the loose pattern catches on the human side resolves the question on its
own. "should communicate, not one thing, but all things; should…" is Emerson.
"where it is, is day; where…" is Stevenson. "No book lay open at his elbow; no…"
is the AI half, and it is the same device.
<!-- slop-ignore-end -->

Balanced antithesis across a semicolon is a rhetorical figure that good writers
reach for on purpose, which places it in the same class as `echo-triad`, being real,
recognisable, and not evidence of anything about who wrote it.

One thing the measurement does show. The shape appears eleven times in this
project's own documentation and zero to four times in any human document
measured, so the reading that prompted this was accurate about the prose in
front of it. A habit of one writer is not a tell, and no rule shipped.

## Calibration so far

Against 30k words of real technical writing, and against a synthetic slop
paragraph as a positive control:

| set | rules | on real prose | on synthetic slop |
|---|---|---|---|
| slop-gate | 28 | 3 findings, 0.1/1k | 6 |
| slopster | 7 | 0 findings | 6 |
| sloptells | 14 | 35 findings, 1.16/1k | — |

slopster reporting zero on the corpus and six on the synthetic sample is the
behaviour to want, since its reveal-shape openers do not occur in technical
documentation.

<!-- slop-ignore-start -->
sloptells' 35 are almost all two rules: `rather-than` (17) and `genuinely` (13).
<!-- slop-ignore-end -->
Both are rated low collateral by sloptells, **but their baselines are Hacker
News, cooking and parenting registers, and this corpus is engineering
documentation**, where "rather than" is ordinary English. A tell's collateral is
register-dependent, and a rating measured on one register does not transfer.

One limit on the other side. Parts of that corpus were probably written with an
<!-- slop-ignore-start -->
assistant, so some of those 13 `genuinely` hits may be true positives rather than
<!-- slop-ignore-end -->
noise. Calibrating against prose of known provenance is the honest next step.

## Closing summary

Nine candidate sets, 84 rules, three new detector kinds, three extraction bugs
and one resolved argument. What follows collects the survey in one place.

### Every source, and what it produced

| source | yield |
|---|---|
| [slop-gate](https://github.com/hwajongpark/slop-gate) | 28 rules. Vocabulary and stock phrases. |
| [slopster](https://github.com/t0ddharris/slopster) | 7 rules. Reveal-shape openers, cross-sentence negation. |
| [sloptells](https://sloptells.com) | 14 rules, ratios against register-matched human baselines, and the em-dash verdict. The best-designed source found. |
| [antislop-sampler](https://github.com/sam-paech/antislop-sampler) + slop-forensics + Slop Score | 12 essay rules, 10 fiction rules. |
| [Measuring AI "Slop" in Text](https://arxiv.org/abs/2509.19163) | 1 rule and a coverage map that reshaped what this project claims. |
| [The Economist](https://www.economist.com/culture/2026/07/30/how-to-spot-ai-writing) | 6 density rules. The best-controlled study. |
| [humanizer-de](https://github.com/marmbiz/humanizer-de) | 2 rules, including sentence-length variation. |
| [simonw thread](https://x.com/simonw/status/2093277255438860358) | 2 structural rules, plus the two that could not be built. |
| [writinglint](https://github.com/NikhilVerma/writinglint) | Nothing. A dependency-parser training experiment, not prose rules. |
| [slop-cop](https://github.com/awnist/slop-cop) | Nothing, but a limitation worth knowing: it uses part-of-speech tagging because word matching over-fires on `leverage`, `harness`, `foster`. This engine cannot make that distinction. |
| [PubMed excess vocabulary](https://pmc.ncbi.nlm.nih.gov/articles/PMC12219543/) | No rules, and the best methodological result in the survey. |
| [Ultimate AI Slop Word Blacklist](https://blog.atharvashah.com/p/the-ultimate-ai-slop-word-blacklist) | Nothing. Downstream of antislop-sampler, inherits its register problem. |
| louisabraham | Nothing. No such article exists on the site. |

### The four things worth recalling

**The em dash is not a tell, measured four separate ways.** sloptells found
acclaimed human prose uses more of them than models do, 0.67 against 0.56 per
1000 characters. The Economist found only Claude above the human rate, with
ChatGPT markedly below. humanizer-de says flatly that a single em dash
proves nothing. This project's own corpus agreed. It is nonetheless shipped as a
always-on rule in `rules/em-dash.json`, because the repo owner does not want
them in his writing, and that is a different question from detection. The rule
says so in its own `measured` field.

**Frequency lists conflate style with topic.** The slop-forensics essay trigrams
are led by phrases that are fingerprints of the prompt set instead of tells.
The PubMed study proves the point on the same corpus with the same method: 2024
excess vocabulary was almost entirely *style* words, while COVID-era excess
vocabulary was almost entirely *content* words. Any list built without a
topic-matched human baseline is a lead, not a finding.

**Collateral is register-dependent and does not transfer.** sloptells rates
<!-- slop-ignore-start -->
`rather than` and `genuinely` as low collateral against Hacker News, cooking and
<!-- slop-ignore-end -->
parenting baselines. In engineering documentation they fire 17 and 13 times in
30,000 words. This is why every source has its own set and nothing is merged.

**Five independent projects converged on rates over occurrences.** sloptells'
slopIndex, slopster's Vale `occurrence`, the antislop sampler's `slop_index.py`,
the arXiv Density and Verbosity codes, and humanizer-de's *Cluster zählen, nicht
Einzelsignale*. That convergence is why `density` and `rhythm` exist, and it is
the strongest single design signal in the whole survey.

### What to graduate into rules/

Calibration is against 30,300 words of human technical prose, with a synthetic
positive control for each set.

| set | on human prose | recommendation |
|---|---|---|
| `antislop` | 0 findings, 15 on control | **Graduate.** Best profile measured. |
| `structural` | 0 findings, all rules fire on control | **Graduate.** Shapes, not phrases, so they survive rewording. |
| `arxiv-slop` | 0 findings, fires on the paper's example | **Graduate.** The one code the literature says this engine should own. |
| `slopster` | 0 findings, 6 on control | **Graduate.** Small and clean. |
| `humanizer-de` | 0 findings | **Graduate the rhythm rule**; the paired-aside threshold is guessed from one side. |
| `slop-gate` | 3 findings, 0.1 per 1000 | **Graduate most of it.** Check the 3 first: vocabulary rules carry the part-of-speech ceiling. |
| `antislop-fiction` | 0 findings | **Keep as a candidate.** Correct and useless outside fiction. Ship it opt-in. |
| `economist` | 6 findings across 6 documents | **Keep as a candidate.** The rules are sound and the thresholds are floors derived from the human side only. Needs an AI-written corpus to finish. |
| `sloptells` | 35 findings, 1.16 per 1000 | **Do not graduate as a set.** Two rules produce almost all of it and both are ordinary English in this register. Take the other twelve individually. |

The survey finishes here. The sources agree on far less than
their confidence suggests, the best of them measure against a human baseline and
the poorest assume one, and the single most reliable finding in six iterations of
mining is that the most famous tell of all is not a tell.
