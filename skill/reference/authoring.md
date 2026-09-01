# Writing and testing rules

## Contents

- Rule format
- The seven matcher kinds and the `notable` verdict
- Testing a rule set (the fudger)
- Fixing a noisy rule

## Rule format

A rule set is one JSON file. Each rule carries its own `tests.hit` and
`tests.miss` examples in that same file, so the examples travel with the rule:
anyone who installs the set can verify it works without writing tests for
someone else's rules. `add`, `update` and `restore` run them automatically and
hold back a set that fails.

```json
{
  "name": "house-style",
  "title": "Our house style",
  "rules": [
    {
      "id": "utilise",
      "name": "\"utilise\" for \"use\"",
      "match":   { "kind": "regex", "pattern": "\\butili[sz]e[sd]?\\b", "flags": "gi" },
      "notable": { ">": 0 },
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

`description` explains what the rule catches; `suggest` is the instruction an
agent acts on. Both appear in `--format json`, so write `suggest` as a
directive ("Delete the hedge and state the fact"), not a description.

### `suggest` is the imperative; `description` and `note` carry the argument

An agent acts on `suggest`. Anything in it that can be read as permission will be
read that way, and the finding will be closed unaddressed with the rule's own
words as the reason. This has happened here twice, so it is written down.

| goes in `suggest` | goes in `description` or `note` |
|---|---|
| Delete the hedge and state the fact. | Fires on genuine three-item lists, which are fine. |
| Name the actor in front of the verb. | Two of fourteen reference papers sit above this edge. |
| Find an aside this document already has and bracket it. | Some good human writing never parenthesises. |

Phrases to keep out of `suggest`: *fine in*, *nothing here is wrong*, *no need*,
*acceptable*, *leave it*, *optional*, *this is a fit judgement*, and any
*if you do not…* clause offering the reader a way out.

The caveats are real and must be recorded, which is what `note` is for. A rule
whose failure mode is written down is a different thing from one that quietly
misfires; a rule that licenses inaction in its instruction field is a third thing,
and it is the one to avoid.

**Every `id` in a set must be unique.** An id is how a rule is selected, ignored,
reported and recorded in the lock file, so two rules answering to one are
ambiguous, not duplicated. A set with a repeat is refused, naming the id.

Optional fields, all printed by `explain <id>`:

| field | what it is for |
|---|---|
| `note` | a known limitation, such as a false positive the rule is kept in spite of |
| `measured` | when a tell was measured and by whom, so a stale one can be recognised |
| `from`, `source` | where a mined rule came from |
| `evidence` | what it scored on a corpus |
| `reference` | the rates measured behind a rate or `rhythm` bound, with `unit`, `human`, `ai` and `tune` fields. Informational: it exists so the threshold can be argued with |
| `default` | `"off"` to keep a rule out of a run unless selected, `"on"` to run it even when its set is opt-in |

Use it with `--rules ./house-style.json`, drop it in the repo's `rules/`
directory, or point the web page at it with `#rules=<url>`.

## The seven matcher kinds

**Seven matcher kinds.** A matcher finds occurrences; `notable` decides whether
they are worth reporting. `density` used to be an eighth kind and is gone: a rate
is a verdict, not a way of matching.

| `match.kind` | fields | finds |
|---|---|---|
| `regex` | `pattern`, `flags` | occurrences of a pattern. Most rules. |
| `chain` | `pattern`, `headTest`, `itemLabel` | `"no X, no Y, no Z"` lists, counting the items |
| `echo` | `minGram`, `minRun`, `anchored`, `minFuncWords` | consecutive sentences sharing a word skeleton |
| `question-chain` | `minRun` | runs of consecutive questions |
| `anaphora` | `minRun` | consecutive sentences opening on the same word |
| `frame` | `gram`, `minRun`, `anchors` | consecutive sentences sharing a *syntactic* frame |
| `rhythm` | `maxSentenceWords`, `minSentenceWords` | nothing: it reports sentence-length variation as a metric |

**`notable` says when the count matters.**

The comparison is the key. Write the operator you mean:

| | |
|---|---|
| `{ ">": 0 }` | any occurrence at all. Every span rule looks like this. |
| `{ ">=": 3, "per": 1000 }` | a habit: 3 or more per 1000 words |
| `{ "<": 1, "per": 1000 }` | an absence, which is also a tell |
| `{ "<=": 30, ">=": 85, "per": 1000 }` | a band: notable on either side of 30-85 |

Two bounds make a band, and the report names the one that was crossed, so a
reader sees which edge the document fell off.

`needs` refuses to judge a document too small for the rate to mean anything:
`{ "words": 250, "sentences": 5, "matches": 2 }`. With `per` set it defaults to
250 words, 5 sentences and a prose gate, so rates stay off config dumps and diffs.


Patterns are JavaScript regular expressions. `flags` only needs `i`; matching is
always global.

## Testing a rule set (the fudger)

```bash
node /tmp/slop/js/cli.mjs fudge ./house-style.json
```

With no argument, `fudge` tests the built-in sets plus any local `ruleSets`
listed in the nearest `slop.json`, so a project's own rules are covered by
the same command.

Two phases:

**Conformance.** Every `tests.hit` example must match and every `tests.miss`
example must not, on plain text.

**Fudging.** Each hit example is rewritten 27 ways with the markup real files
carry, and the rule must still fire:

```
**It is important to note that** this works.   md:bold-span
It is imp**ort**ant to note that this works.   md:bold-inside-word
It is important\nto note that this works.      md:soft-wrap
<p>It is imp<b>ort</b>ant to note that …       html:tag-inside-word
<p>It is important <!-- note --> to note …     html:comment-before-word
<p><span>It</span> <span>is</span> …           html:span-per-word
```

A lossless variant that turns a hit into a miss is a bug, either in extraction or in
a rule too tight for real files. Variants that actually delete words (a long
inline code span) are marked lossy and reported for information only.

Write the example first, run `fudge`, then fix whatever it reports.

## Fixing a noisy rule

A rule that fires constantly usually needs a constraint it does not have.
Deleting it is the last resort, not the first.

Count the hits by rule over a real corpus:

```bash
node /tmp/slop/js/cli.mjs check --format json -r docs/ \
  | jq -r '.files[].findings[].rule' | sort | uniq -c | sort -rn
```

Then read twenty hits of the worst offender. The hits themselves tell you the
missing constraint. A worked example is in the repo's `docs/calibration.md`:
`colon-triple` produced 45% of all findings on technical writing, and 16 of its
21 hits were docstrings, matrix algebra and hardware lists, not prose.
Requiring prose characters and a lowercase initial in each item removed every
false positive without losing a single real hit, and the false positives went
into `tests.miss`, so the regression is locked in.
