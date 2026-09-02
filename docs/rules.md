# Rule sets

A rule set is a JSON package with a name, a version, and a list of rules that each
bring their own test examples. This covers choosing, installing, updating,
sharing and writing them.

## What ships


| set | rules | what it covers |
|---|---|---|
| `ai-tells` | 78 | Everything this project gathered itself, from research papers, style guides, other detectors and reader reports. Each rule records where it came from and how it scored. |
| `simonwillison` | 27 | Stock phrasings and rhythms models overproduce. From Simon Willison's [LLM cliché highlighter](https://tools.simonwillison.net/llm-cliche-highlighter). |
| `wikipedia-ai` | 11 | Tells catalogued in Wikipedia's [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing). |
| `load-bearing` | 1 | One measurement of how far a document's vocabulary spreads across the group that arrived in [louisabraham/load-bearing](https://github.com/louisabraham/load-bearing). Rebuilt from upstream by `tools/load-bearing.mjs`. |

Off by default, alongside the 5 style profiles:

| set | rules | what it is |
|---|---|---|
| `unreproduced` | 5 | Patterns published elsewhere that this repo's corpus measured running the other way: they fired on human documents and not on AI ones. Kept because 36 documents is a small corpus and a pattern that fails on technical prose may hold on another register. |

All 4 sets ship on, and every rule in them runs. Everything this project mined
itself is in `ai-tells`. Each rule records where it came from in `from` and
`source` and their score in `evidence`. Nothing there is kept back, because a rule that
never fires on your own register costs nothing to leave on, and the 10
creative-writing rules never fire on documentation. The 5 the audit measured
seen on human prose and not on AI prose were a different case, because those
do fire, so they moved to `candidates/unreproduced.json` where turning one
on is an explicit choice. The `em-dash` rule is house style rather than a tell;
`slop explain em-dash` gives the evidence, which points the other way.

```sh
slop list                    # every rule and whether it is active
slop explain note-that       # one rule in full
```

## Choosing sets


```sh
slop check --select wikipedia-ai docs/ -r        # one set
slop check --ignore promo,landscape docs/ -r     # drop 2 rules
slop check --select colon-triple docs/ -r        # one rule on its own
slop check --all docs/ -r                        # everything
```

Or in `slop.json`, found by walking up from the working directory:

```json
{
  "select": ["simonwillison", "wikipedia-ai"],
  "ignore": ["colon-triple"],
  "ruleSets": ["./rules/house-style.json"],
  "exclude": ["vendor/", "node_modules/"],
  "maxPer1000": 3.0
}
```

Every rule ships enabled. `colon-triple` nearly did not, having produced 45% of all
findings on a real corpus, and 16 of its 21 hits were docstrings, matrix algebra
and hardware lists, not prose. Tightening the rule worked better than disabling it: 5
hits, all correct, with full recall on the examples. See
[docs/calibration.md](docs/calibration.md) for the method.

## Installing rule sets


A rule set is a package. It carries its own `name` and `version`, and the
`slop` version it was built against:

```json
{ "name": "house-style", "version": "1.1.0", "slop": "0.1.0",
  "title": "Our house style", "rules": [ … ] }
```

`add` downloads one into `.slop/rules/`, beside your `slop.json`.
It is compiled and run through its own tests on the way in, then becomes active
immediately. You do not pass a flag or edit the config:

```sh
slop add https://example.com/house-style.json
slop add https://example.com/rules/index.json    # a manifest: several at once
slop add ./local-set.json
```

A URL can hold one set, an array of sets, or a `{"sets": [...]}` manifest naming
files beside it, the layout this repo's own `rules/index.json` uses, so
`slop add <that url>` installs both of ours.

```sh
slop sets                # version, rule count, active, tests, source
```

```
SET                   VERSION   RULES  ACTIVE  TESTS       SOURCE
simonwillison           v1.0.0       27  all     pass        built-in
wikipedia-ai          v1.0.0       11  all     pass        built-in
house-style           v1.1.0        2  all     pass        https://example.com/house-style.json

library: .slop/rules/  lock: .slop/rules.lock.json  engine: slop 0.1.0
```

## Updating


`.slop/rules.lock.json` records where each set came from, its version, a
hash of its rules, and whether it passed. `update` re-fetches from that source:

```sh
slop update --check      # report what is available, change nothing
slop update              # take the ones that pass
slop update house-style  # just one
```

```
update  house-style 1.0.0 → 1.1.0  tests pass
```

**A candidate that fails is refused.** The working version remains in place:

```
held back house-style 1.0.0 → 1.2.0  2 failing — --force to install anyway
```

Failing *what*, exactly? Every rule in a set carries its own `tests.hit` and
`tests.miss` examples in the same JSON file, so the examples travel with the
rule. Anyone who fetches the set can run them, which is what `add`, `update`
and `restore` do before installing, and what `slop fudge` does on demand.
You do not have to write tests for someone else's rules to know whether they
work on your machine.

So an update from a source you do not control is checked before it can get to
your CI. `add` and `restore` hold back the same way, and `--force` overrides all
3 when you want a work-in-progress set anyway:

```sh
slop add --force ./draft-rules.json
```

A forced install is marked, and its failure recorded in the lock, so
`sets` still shows it as failing, and never passes it in silence.

A set built against a newer `slop` than yours is reported too, since it may
use a detector kind this engine does not have.

## Sharing a library


The lock file is the portable artifact. Commit it, or hand it to someone:

```sh
slop restore                     # from .slop/rules.lock.json
slop restore shared.lock.json    # from anywhere
```

Each set is re-fetched from its recorded source and tested; one that fails is
skipped unless you pass `--force`. If the source now serves something different
from what the lock recorded, you get:

```
restored house-style v1.1.0 2 rules  differs from the lock (1.0.0 → 1.1.0)
```

Committing `.slop/rules/` as well fixes the exact files; committing only
the lock brings them up to date. `slop fudge` tests the built-ins, the library
and anything in `ruleSets` together. Installed rules face the same two phases
that ours face.

An installed set **shadows** a built-in of the same name, so you can pin or
customise the rules that ship here by installing your own `simonwillison`.

Switch one off with `--ignore <name>`, or in `slop.json`:

```json
{ "ignore": ["draft-voice"] }
```

## Writing your own


A rule set is a JSON file. Copy [`examples/house-style.json`](examples/house-style.json):

```json
{
  "name": "house-style",
  "title": "Our house style",
  "rules": [
    {
      "id": "utilise",
      "name": "\"utilise\" for \"use\"",
      "kind": "regex",
      "pattern": "\\butili[sz]e[sd]?\\b",
      "flags": "gi",
      "severity": "error",
      "description": "\"Utilise\" is never better than \"use\".",
      "suggest": "Write \"use\".",
      "tests": {
        "hit":  ["We utilise the cache for lookups."],
        "miss": ["The utility ran overnight."]
      }
    }
  ]
}
```

```sh
slop check --rules examples/house-style.json --select house-style docs/ -r
```

Then use it from anywhere:

```sh
slop check --rules ./house-style.json --select house-style docs/ -r
slop check --rules https://example.com/house-style.json docs/ -r
```

Drop it in `rules/` to make it a built-in for your repo, point at it with
`ruleSets` in `slop.json`, or hand the web page a `#rules=` URL. The page
also takes one from its file picker or a drag-and-drop.

Fetching a rule set runs someone else's patterns over your text. The browser
caps a runaway rule with the worker timeout; **the CLI does not**, so read a
rule set before pointing production CI at a URL you do not control.

**The 7 matcher kinds.** A matcher finds occurrences; `notable` settles whether
they are big enough to report. `density` used to be an eighth kind and was removed, because a rate
is a threshold, not a way of matching.

| `match.kind` | fields | finds |
|---|---|---|
| `regex` | `pattern`, `flags` | occurrences of a pattern. Most rules. |
| `chain` | `pattern`, `headTest`, `itemLabel` | `"no X, no Y, no Z"` lists, counting the items |
| `echo` | `minGram`, `minRun`, `anchored`, `minFuncWords` | consecutive sentences sharing a word skeleton |
| `question-chain` | `minRun` | runs of consecutive questions |
| `anaphora` | `minRun` | consecutive sentences opening on the same word |
| `frame` | `gram`, `minRun`, `anchors` | consecutive sentences sharing a *syntactic* frame |
| `rhythm` | `maxSentenceWords`, `minSentenceWords` | nothing: it reports sentence-length variation as a metric |

**`notable` says when the count is reportable.**

The comparison is the key. Write the operator you mean:

| | |
|---|---|
| `{ ">": 0 }` | any occurrence at all. Every span rule looks like this. |
| `{ ">=": 3, "per": 1000 }` | a habit: 3 or more per 1000 words |
| `{ "<": 1, "per": 1000 }` | an absence, which is also a tell |
| `{ "<=": 30, ">=": 85, "per": 1000 }` | a band: notable on either side of 30-85 |

Two bounds make a band, and the report names the bound it passed, so a
reader can see which edge the document went outside.

`needs` declines to score a document too small for the rate to mean anything:
`{ "words": 250, "sentences": 5, "matches": 2 }`. With `per` set it defaults to
250 words, 5 sentences and a prose filter, so rates keep away from config dumps and diffs.


`tests.hit` and `tests.miss` are required, and they are not decoration. See
below.

---

## Fudging, or testing a rule set


```sh
slop fudge examples/house-style.json    # one set
slop fudge                              # every built-in set, plus any
                                              # `ruleSets` in slop.json
```

The web page runs the same checks under **test rules**, with failures sorted to
the top, which is useful while you are still writing the pattern.

```
rule sets: simonwillison, wikipedia-ai  (38 rules)
conformance: 198 pass, 0 fail
fudging:     3267 pass, 0 fail  (117 expected misses on lossy markup)
```

Two phases:

**Conformance.** Every `tests.hit` example must match and every `tests.miss`
example must not, on plain text.

**Fudging.** Each `hit` example is then remade 26 ways, injecting the markup
a real document carries, and the rule must still fire:

```
It is important to note that this works.          the example
**It is important to note that** this works.      md:bold-span
It is _important_ to note that this works.        md:italic-word
It is imp**ort**ant to note that this works.      md:bold-inside-word
It is important[^1] to note that this works.      md:footnote-after-word
It is important\nto note that this works.         md:soft-wrap
<p>It is <em><strong>important</strong></em> …    html:nested-em-strong
<p>It is imp<b>ort</b>ant to note that …          html:tag-inside-word
<p>It is important <!-- note --> to note …        html:comment-before-word
<p><span>It</span> <span>is</span> …              html:span-per-word
```

A variant that turns a HIT into a MISS is a bug, either in extraction or in the rule
<!-- slop-ignore-start -->
being too tight for real files. Variants that genuinely delete words (inline
<!-- slop-ignore-end -->
code) are marked lossy and only reported for information.

That is how you refine a rule. Write the example, run `fudge`, and fix what
it reports.
It proved useful at once. The first run found four real bugs, listed in
[docs/extraction.md](docs/extraction.md).

---


See also [calibration.md](calibration.md), on how a noisy rule gets fixed instead of disabled.

---

## What a finding does and does not mean

**A finding is not evidence that AI wrote something.** It is evidence that a
phrase is worn. Human writers produce every pattern here, and current models
avoid some of them. If you want to know who wrote a document, this is the incorrect
tool, and so is every other one. The paper that defines the field
([arXiv 2509.19163](https://arxiv.org/abs/2509.19163)) reports that standard
metrics fail to match what people report, and that reasoning models fail at
extracting these spans too.

That paper's taxonomy has 11 codes. Measured against it, without flattery:

| | |
|---|---|
| **Reached** | Repetition, Templatedness |
| **Partly reached** | Verbosity, Word Complexity, Tone |
| **Not reached** | Factuality, Relevance, Bias, Coherence, Fluency |

The last line is not a to-do list. Those five need human annotation, and the
paper says so. A linter that asserted them would be making it up.

There is a second limit. This engine matches patterns over spans, with no
<!-- slop-ignore-start -->
part-of-speech information. That is why `leverage`, `harness` and `foster` are
<!-- slop-ignore-end -->
hard. They are slop as verbs and plain English as nouns, and a regex cannot
tell the difference. The `frame` detector approximates syntax by wildcarding
content words, which works, but it is an approximation.

## Limits

- **English only.** The patterns are hard-coded English. Prose in another
  language passes with almost nothing reported. No findings is not evidence of clean prose.
- **Heuristics, not proof.** `ai-vocab` firing once means little; several
  times is a tell. Set a budget; do not demand zero.
- **Long inline code spans are removed.** A single short token is kept. Anything
  with a space in it is treated as a code fragment and skipped.
- **Markdown tables can trip `echo-triad`.** Set `"skipTables": true` in
  `slop.json`, which this repo does for exactly that reason.
- **`.rtf` is not supported.** Convert to `.md` or `.txt` first.

To quote bad prose on purpose, wrap it in `<!-- slop-ignore-start -->` and
`<!-- slop-ignore-end -->`. Works in markdown and HTML.
