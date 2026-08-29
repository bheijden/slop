# Rule sets

A rule set is a JSON package: a name, a version, and a list of rules that each
carry their own test examples. This covers choosing, installing, updating,
sharing and writing them.

## What ships


| set | rules | what it covers |
|---|---|---|
| `simonwillison` | 27 | Stock phrasings and rhythms models overproduce. From Simon Willison's [LLM cliché highlighter](https://tools.simonwillison.net/llm-cliche-highlighter). |
| `wikipedia-ai` | 11 | Tells catalogued in Wikipedia's [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing). |
| `em-dash` | 1 | House style: flags every em dash. A preference, not a tell. `slop explain em-dash` gives the evidence, which points the other way. |

```sh
slop list                    # every rule and whether it is active
slop explain note-that       # one rule in full
```

## Choosing sets


```sh
slop check --select wikipedia-ai docs/ -r        # one set
slop check --ignore promo,landscape docs/ -r     # drop two rules
slop check --select colon-triple docs/ -r        # one rule, even though it is off by default
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

Every rule ships enabled. `colon-triple` nearly did not: it produced 45% of all
findings on a real corpus, and 16 of its 21 hits were docstrings, matrix algebra
and hardware lists rather than prose. Tightening the rule beat disabling it: 5
hits, all genuine, with full recall on the examples. See
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
files beside it, the shape this repo's own `rules/index.json` uses, so
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

**A candidate that fails is held back.** The working version stays:

```
held back house-style 1.0.0 → 1.2.0  2 failing — --force to install anyway
```

Failing *what*, exactly: every rule in a set carries its own `tests.hit` and
`tests.miss` examples in the same JSON file, so the examples travel with the
rule. Anyone who fetches the set can run them, which is what `add`, `update`
and `restore` do before installing, and what `slop fudge` does on demand.
You do not have to write tests for someone else's rules to know whether they
work on your machine.

So an update from a source you do not control is checked before it can reach
your CI. `add` and `restore` hold back the same way, and `--force` overrides all
three when you want a work-in-progress set anyway:

```sh
slop add --force ./draft-rules.json
```

A forced install is labelled and its failure is recorded in the lock, so
`sets` keeps showing it as failing rather than quietly passing.

A set built against a newer `slop` than yours is flagged too, since it may
use a detector kind this engine does not have.

## Sharing a library


The lock file is the portable artifact. Commit it, or hand it to someone:

```sh
slop restore                     # from .slop/rules.lock.json
slop restore shared.lock.json    # from anywhere
```

Each set is re-fetched from its recorded source and tested; one that fails is
skipped unless you pass `--force`. If the source now serves something different
from what the lock recorded, you are told:

```
restored house-style v1.1.0 2 rules  differs from the lock (1.0.0 → 1.1.0)
```

Committing `.slop/rules/` as well pins the exact files; committing only
the lock keeps them fresh. `slop fudge` tests the built-ins, the library
and anything in `ruleSets` together. Installed rules face the same two phases
that ours face.

An installed set **shadows** a built-in of the same name, so you can pin or
customise the rules that ship here by installing your own `simonwillison`.

Turn one off with `--ignore <name>`, or in `slop.json`:

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

**Eight detector kinds.** Most rules are `regex`; the other seven are
parameterised algorithms for things a regex cannot express.

| `kind` | fields | detects |
|---|---|---|
| `regex` | `pattern`, `flags` | a pattern. 33 of the 38 built-ins. |
| `chain` | `pattern`, `headTest`, `itemLabel` | `"no X, no Y, no Z"` lists, counting items |
| `echo` | `params.minGram`, `params.minRun` | consecutive sentences sharing a skeleton |
| `question-chain` | `params.minRun` | runs of consecutive questions |
| `anaphora` | `params.minRun` | consecutive sentences opening on the same word |
| `density` | `pattern`, `params.min` or `params.max` | a document-level *rate* rather than a span |
| `rhythm` | `params.maxCV` | sentence-length variation, as stddev over mean |
| `frame` | `params.gram`, `params.minRun` | consecutive sentences sharing a *syntactic* frame |

A `density` rule counts matches per 1000 words over the whole document and
fires once, not per match. `params.min` catches pile-up, `params.max` catches
*scarcity*, which is a real tell. The Economist found LLM prose uses **fewer**
commas, semicolons and parentheses than human writing, not more. It refuses to
run below `params.minWords` (250 by default), and a prose gate skips anything
that is not prose at all, because a config dump or a diff has no commas either.
`params.minSentences`, `params.minSentenceWords` and `params.maxSentenceWords`
tune that gate.

`rhythm` is the other document-level kind. It has no pattern: it measures the
coefficient of variation of sentence length and fires when prose is metrically
monotone. Both kinds share the prose gate and both report once per document.

`frame` is what `echo` cannot do. `echo` looks for repeated *words*; `frame`
wildcards the content words and compares only the closed class, so
"Dr. Smith, a researcher at Oxford University, found that…" matches
"Professor Johnson, a scientist at Cambridge University, discovered that…"
even though no content word is shared. It is a crude stand-in for
part-of-speech tagging, and it only compares sentences that look like prose,
because repeated code lines are legitimately templated.

A density or rhythm rule is only as good as its threshold, so calibrate on your
own corpus. The ones in `candidates/economist.json` come from a 16-document sample
and are meant to be changed.

`tests.hit` and `tests.miss` are required, and they are not decoration. See
below.

---

## Fudging: testing a rule set


```sh
slop fudge examples/house-style.json    # one set
slop fudge                              # every built-in set, plus any
                                              # `ruleSets` in slop.json
```

The web page runs the same thing under **test rules**, with failures sorted to
the top, which is useful while you are still writing the pattern.

```
rule sets: simonwillison, wikipedia-ai  (38 rules)
conformance: 182 pass, 0 fail
fudging:     3066 pass, 0 fail  (86 expected misses on lossy markup)
```

Two phases:

**Conformance.** Every `tests.hit` example must match and every `tests.miss`
example must not, on plain text.

**Fudging.** Each `hit` example is then rewritten 26 ways, injecting the markup
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
being too tight for real files. Variants that genuinely delete words (inline
code) are marked lossy and only reported for information.

That is how you refine a rule. Write the example, run `fudge`, and fix whatever
it reports.
It earned its place immediately. The first run found four real bugs, listed in
[docs/extraction.md](docs/extraction.md).

---


See also [calibration.md](calibration.md): how a noisy rule gets fixed rather than disabled.
