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
| [slopster](https://github.com/t0ddharris/slopster) | lint rules + agent skill | pending |
| [writinglint](https://github.com/NikhilVerma/writinglint) | NLP dependency rules | pending |
| [slop-cop](https://github.com/awnist/slop-cop) | in-browser detector | pending |
| [antislop-sampler](https://github.com/sam-paech/antislop-sampler) | generation-time phrase list | pending |
| [EQ-Bench slop score](https://eqbench.com/slop-score.html) | leaderboard + word list | pending |
| [Measuring AI "Slop" in Text](https://arxiv.org/abs/2509.19163) | paper, taxonomy | pending |
| [Excess vocabulary in LLM writing](https://pmc.ncbi.nlm.nih.gov/articles/PMC12219543/) | paper, 15M abstracts | pending |
| [LLM usage in scientific papers](https://www.nature.com/articles/s41562-025-02273-8) | paper, 1M+ papers | pending |
| [Ultimate AI Slop Word Blacklist](https://blog.atharvashah.com/p/the-ultimate-ai-slop-word-blacklist) | word list | pending |
| The Economist, AI writing in 2026 | report incl. red herrings | pending |
| [simonw tweet thread](https://x.com/simonw/status/2093277255438860358) | replies | structural tells; 3 further sources |
| [sloptells.com](https://sloptells.com) | auto-mined weekly, pre-LLM vs AI corpus | pending — found via the thread |
| [louisabraham word list](https://louisabraham.github.io) | banned-word list | pending — found via the thread |
| [marmbiz humanizer](https://github.com/marmbiz) | ~72 patterns, German | pending — found via the thread |

## Per-source notes

### slop-gate → [candidates/slop-gate.json](../candidates/slop-gate.json)

39 vocabulary rules and one punctuation rule. Eleven duplicated the shipped
sets (delve, tapestry, meticulous, pivotal, vibrant, bustling, nestled,
testament, worth-noting) and were dropped; 28 were converted.

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

> The lexical ones are the easy 38. The stubborn tells are structural:
> rule-of-three lists, the not just X but Y frame, hedge-then-affirm. Those
> survive a synonym swap because the sentence skeleton is the watermark, not the
> vocabulary.

> The vocabulary is easy to prompt out. The harder tell to fix is the cadence:
> setup, neat contrast, tidy moral.

> the pattern that keeps getting stamped on my own drafts is the three-beat one.
> punchy opener, receipt, tidy closer. word lists miss it completely.

Two further remarks worth carrying into the method:

- One reply derived rules from 875 posts across five accounts: *"Cross checking
  against the other four killed 3 of them"* — five of eight rules survived. The
  same result the calibration method here produces, arrived at independently.
- *"A phrase can be stale in one paragraph and exact in another"* — an argument
  for reporting why a rule fired and letting the writer decide, which is what
  `suggest` and the hover card do.

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
