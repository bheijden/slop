# Style profiles

A style profile measures a document against a register. It asks a different
question from the rest of slop. It asks not "is there a worn phrase here" but "does this
sound like the writing I am aiming at".

Five ship as candidates. Every rule reports a rate or a variation instead of a
span, every rule is off by default, and none of them can change what the slop
detector reports.

## A band, not a ceiling

A slop rule is a one-sided ceiling on a tell. It is near-silent on good human
prose, and a finding means something is probably wrong.

A style rule is a two-sided band on a register, and good writing goes outside it all
the time. A finding means the document sits outside the band, which is a
statement about fit and carries no criticism at all.

| | slop rule | style rule |
|---|---|---|
| shape | ceiling on a tell | band on a register |
| kinds | any of the seven | rates and `rhythm` only |
| a finding means | this is probably worn | this is off target for that register |
| on good prose | should be silent | fires routinely |
| what to do about it | usually rewrite | rewrite, or change the band |
| default | on | off |

The two verdicts are independent. A paragraph can be clean of every tell and
still sit far outside the register you wanted, and a draft positioned at the exact
centre of a band can be full of stock phrasing. No result of either kind is evidence about the
other.

Because the share of your documents falling outside a band is the specificity
of the register and not a false-positive rate, a profile built for journalism
that reports constantly on API reference is working correctly and is the wrong
profile for that document.

## The five

Each was calibrated against a reference corpus in its own register, and each
records that corpus in a `corpus` field you should read before relying on a
number. The last column is this repo's usual 30k words of human technical
documentation, which is out of register for all five on purpose and shows the
size of the distance, not the centre of the band.

| profile | rules | the register | on the audit corpus, 18 human documents, 17.3k words |
|---|---|---|---|
| [`style-plain`](../candidates/style-plain.json) | 10 | Plain English. Everyday words, a named actor, one idea to a sentence, the reader as "you". | 28 findings, 15 documents |
| [`style-conversational`](../candidates/style-conversational.json) | 8 | Warm spoken register for consumer software. Contractions, "you" and "we", a question answered in the next line. | 53 findings, 17 documents |
| [`style-newsroom`](../candidates/style-newsroom.json) | 6 | Wire service. Third person past tense, one idea to a sentence, every contested claim attributed with the verb "said". | 48 findings, 17 documents |
| [`style-economist`](../candidates/style-economist.json) | 9 | Economist house style. Concrete, active, about twenty words to a sentence, Anglo-Saxon in preference to Latinate. | 42 findings, 16 documents |
| [`style-academic`](../candidates/style-academic.json) | 9 | Formal scholarly. Citations, hedged claims, measurement fronted, nothing contracted. | 52 findings, 18 documents |

The bands really are opposed. Two passages of about 300 words, one clearly
conversational and one clearly scholarly, run over both of the profiles built
for those registers:

```
                          conversational passage   academic passage
  style-academic          7 findings               1 finding
  style-conversational    0 findings               7 findings
```

The conversational passage carries 65.8 second-person pronouns and 65.8
contractions per 1000 words at 9.8 words a sentence, with a citation rate of
zero. The academic one runs 104 nominalisations and 33.6 hedges per 1000 words
at 21.9 words a sentence, and addresses the reader not once. Each profile is
silent on its own register and noisy on the other, which is what separates a band
from a general complaint about prose.

## Selecting one

Style rules carry `"default": "off"`, so installing a profile changes nothing
until you ask for it.

Naming the set is enough. Because every rule in a profile is off by default,
naming the set overrides that default for exactly those rules and nothing else:

```sh
slop check --rules candidates/style-plain.json --select style-plain -r docs/
```

Installed profiles work the same way, and so does a `slop.json` entry:

```json
{ "select": ["simonwillison", "wikipedia-ai", "style-plain"] }
```

**One profile at a time.** Selecting two is refused instead of merged, because
a document cannot sit in two registers at once and the two bands would report it
as simultaneously too formal and not formal enough:

```
slop: select: pick one style profile, not 2 (style-academic, style-plain).
```

Individual rules can still be named, ignored or overridden exactly as any other
rule, so `--ignore style-plain-passive-high` works if one band does not suit you.

**Run style as a separate pass.** Style findings appear in the same array and the
same `--max` and `--max-per-1000` budget as slop findings, and 74 findings from
`style-academic` on a corpus would swamp a `maxPer1000` of 3.0 with measurements
that are not faults. Two runs, two budgets, two word-lists.

**Pick one profile.** Two registers contradict each other by construction, and
nothing in the engine prevents you selecting both. Running `style-academic` and
`style-conversational` together produces a list of complaints with no coherent
target behind it.

## What a profile cannot do

A style profile cannot weaken, mute, shadow or override a slop rule. There is
no field in the schema for it.

The guarantee is structural, not a matter of policy. A rule with `per` set
and a `rhythm` rule report at document level, and a document-level match takes an
early return in `analyze()` without entering the span-overlap loop, so it
can never consume an adjacent span. Any other kind
could, because a single greedy `regex` rule matching an entire sentence will collapse a
slop finding inside it and say nothing about having done so.

Measured on 30k words with 365 slop findings, loading and activating a
profile alongside the shipped sets leaves all 365 unchanged.

```sh
slop check --format json -r corpus/ > a.json
slop check --format json -r corpus/ --rules candidates/style-plain.json --select <ids> > b.json
# every finding whose set does not start with style- is unchanged
```

Nothing enforces the kinds. A profile that shipped a `regex` rule would be
loaded and run like any other set, so read one before selecting it.

## Where a band and a rule conflict

Most apparent conflicts are not conflicts. A slop rule sets a ceiling and a
style band sets an interval, and on the same metric they stack into three zones.
`candidates/style-economist.json` reports em dashes at 35 per 1000 and above, on the
basis that they have stopped doing any work. A register that wants them might
put its floor at 3. Between 3 and 35 both are silent, and above 35 both report
and agree.

Some conflicts are real. A conversational register asks the reader two questions
one after another on purpose, and `stacked-questions` flags exactly that. A rhetorical
register repeats sentence openings on purpose, and `sentence-anaphora` flags
exactly that. At a variation of 0.38 the prose really is metrically monotone,
which `humanizer-de/uniform-sentence-length` reports, and it really is what a
plain register asks for.

Each profile records these in a `tension` field, which is annotation and
nothing else:

```json
"tension": [
  { "rule": "stacked-questions",
    "note": "This set flags two consecutive questions. This register asks the reader questions on purpose. Slop findings stand." }
]
```

Both verdicts firing at once, separately named, is the honest outcome, and
you arbitrate. If you decide a slop rule is wrong for your writing, the
suppression goes in your own `slop.json`, under your name and in review:

```json
{ "select": ["simonwillison", "wikipedia-ai"], "ignore": ["stacked-questions"] }
```

## Reading a finding

A document-level finding has no culprit span, so it does not pretend to have
one. It reports `document` in place of a line and column, and the measurement in
place of a quoted phrase:

```
  document  style-academic-citation-low 0 in 1168 words, 0 per 1000 <= 2
            fix: Below the academic floor (2 attributed sources per 1000 words) …
```

Read it as a rate against a band, not as an accusation aimed at a sentence. The
number before `per 1000` is what your document does; the comparison after it is
the edge it crossed, written out. Both are visible so you can
tell how far off you are, and decide whether to move the prose or move the band.

`--format json` carries the same information, where a doc-level finding has
`docLevel: true` and a `measure` string, and its `line` and `col` are the
anchor, not a location.

## Writing your own

A profile is a normal rule set. `slop add`, `slop update` and `slop fudge`
all work on one, and `slop fudge candidates/style-<name>.json` has to pass.

```jsonc
{
  "name": "style-house",        // must equal the filename stem
  "role": "style",
  "version": "0.1.0",
  "slop": "0.1.0",
  "title": "Our house register",
  "description": "…",
  "source": "https://…",        // the style guide or corpus
  "corpus": { "documents": 18, "words": 24527, "note": "how these were measured" },
  "voice": "One paragraph a human reads before choosing this profile.",
  "rules": [ … ]
}
```

Rules are `regex` or `rhythm`, `"default": "off"`, `"severity": "info"`, and ids
namespaced with the full set name. Ids are global across every loaded set and a
duplicate is refused with the name of the set it clashes with, so
`style-house-comma` and not `comma`.

**`notable` carries the comparison, so write the operator you mean.** A one-sided
edge is one bound. A band is two bounds on the same rule, and it is silent
between them:

```jsonc
"notable": { "<=": 30, ">=": 85, "per": 1000, "unit": "words" }
```

That reports a document at 30 commas per 1000 words or fewer, or at 85 or more,
and says nothing in between. The finding names the bound that was crossed, so one
rule covers both edges, which means its `suggest` has to serve both. Write what
to do below the band and what to do above it, in that order.

Name a metric for what a reader perceives, not for the direction of the number.
For sentence length the two run in reverse. Few endings per 1000 words means long
sentences, so the *lower* bound is the *long*-sentence edge.

| metric | kind | pattern | lower bound reports | upper bound reports |
|---|---|---|---|---|
| `sentence-length` | regex | `[.!?](?=\s\|$)` | long sentences | short ones |
| `rhythm` | rhythm | none | even pacing | lurching pacing |
| `comma` | regex | `,` | little subordination | heavy subordination |
| `second-person` | regex | `\b(?:you\|your\|yours)\b` | the reader is absent | the reader is addressed |
| `nominalisation` | regex | `\b\w{4,}(?:tion\|ment\|ity\|ness)s?\b` | plain nouns | abstract ones |
| `passive` | regex | `\b(?:is\|are\|was\|were\|be\|been)\s+\w+(?:ed\|en)\b` | the actor in front | the actor suppressed |

### The prose gate will eat your sentence-length rules

Both kinds ignore anything that does not look like prose:

```js
if (perSentence > maxSentenceWords || perSentence < minSentenceWords) return [];
```

The defaults are 60 and 4 words a sentence. The gate exists to keep a config
dump or a diff from being measured, and it does that job well, but it also throws
out the documents a sentence-length band exists to report on.

Measured, with all five profiles selected, a 2,299-word document averaging 86
words a sentence is reported by one of the five. A 458-word document averaging
2.4 words a sentence is reported by none of them, although 4 carry a rule
named `sentence-length-short`. The rules are not wrong. The documents never
get to them.

`style-newsroom` is the one that works, because it opens
`maxSentenceWords` to 120 on its long-sentence rule only, and leaves the default
everywhere else. Do that. Widen the gate on the rules whose metric the gate is
measuring, where the default works against you, and leave it narrow on the rest.
Opening it everywhere has its own cost, which the `corpus` notes in these five
profiles record at length. At 200 words a sentence a Python source file and a
page of bullet points count as prose, and you get a report that a module
carries too few abstract nouns.

`--skip-tables` is a good idea on documentation either way. Table cells are
extracted as running text with no full stop, which pulls apparent sentence
length up, and a thousands separator inside a figure counts as a comma.

### Fixtures

`tests.hit` is off band and `tests.miss` is in band, and both are required.

- 280 words minimum, not 250. Fudge variants perturb the extracted word count
  and a fixture at exactly 250 can drop under `needs.words` in a variant.
- 12 sentences minimum, above the `needs.sentences` default of 5 for a rate and
  8 for `rhythm`. Watch for a rule that sets it higher, because `needs.sentences` of 15 on a
  band whose lower bound is the long-sentence edge needs well over a thousand
  words of fixture, because long-winded prose has few sentences by
  construction.
- Every fixture at least 20% clear of every edge that names it. A fixture at a
  variation of 0.48 against a ceiling of 0.55 is a coin toss once markup moves
  the numbers.
- Plausible prose in a plausible register. A human reviewing the profile reads
  them.

Expect two or three failed `fudge` runs before the fixtures line up.

### What to write in the strings

`suggest` is the only prose that appears in a terminal, and it is the only place the
band appears at all. Three clauses, naming which edge was passed with the profile
and the numbers written out, then a conditional direction, then the concession.

> Below the plain band (2 to 40 second-person pronouns per 1000 words). If you
> want this register, address the reader directly. If you do not, the band is
> what to change.

The grammatical subject is the document, never the writer. Say band, edge,
register, off target, above, below, fit. Do not say wrong, bad, broken, error,
violation, fix, avoid, must or should, and do not say anything about who or what
wrote the text. A profile measures a document against a register and has no
opinion on authorship.

`measured` is required and `slop explain` prints it. State the band in reader
units, the corpus behind it, the observed minimum, median and maximum, and which
percentiles set the edges. A band without one is a guess dressed as a number.

## The honest limits

A band is a threshold at each end, so it is doubly easy to get wrong as a
slop threshold, and there is no "should report nothing" safety net to fall back
on. Three of these five rest partly on opinion, not on measurement, and
each says so in the rule that does it. The numbers here are the right shape and
another project's numbers. Retune them against prose you actually want to sound
like, and treat a persistent finding as a question about the band as often as a
question about the draft.
