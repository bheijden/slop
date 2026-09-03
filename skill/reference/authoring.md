# Writing and testing rules

## Contents

- Rule format
- The seven matcher kinds and the `notable` verdict
- Testing a rule set (the fudger)
- Fixing a noisy rule

## Rule format

A rule set is a single JSON file. Each rule brings its own `tests.hit` and
`tests.miss` examples in that same file, so the examples travel with the rule.
anyone who installs the set can verify it works without writing tests for
someone else's rules. `add`, `update` and `restore` run them automatically and
refuse a set that fails.

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

### Write the description for a reader, not for yourself

A `description` is read by someone who has just been given a finding and does
not know the rule. Open with what it catches and where it came from, in plain
words. Put the evidence next. Put the mechanics last, or leave them out.

| first | last |
|---|---|
| what the rule catches | how the number is computed |
| where the pattern came from | why the divisor is what it is |
| what a finding means | correlations, percentiles, thresholds |

A set's own `description` follows the same order. Say what the set is for, who
would choose it, then where it came from, then how it works.

### `suggest` is the imperative; `description` and `note` carry the argument

An agent acts on `suggest`. Anything in it that can be read as permission will be
read that way, and the finding will be closed unaddressed with the rule's own
words as the reason. This has come up here more than once, so it is written down.

| goes in `suggest` | goes in `description` or `note` |
|---|---|
| Delete the hedge and state the fact. | Fires on genuine three-item lists, which are fine. |
| Name the actor in front of the verb. | Two of fourteen reference papers sit above this edge. |
| Find an aside this document already has and bracket it. | Some good human writing never parenthesises. |

Phrases to keep out of `suggest` are *fine in*, *nothing here is wrong*, *no need*,
*acceptable*, *leave it*, *optional*, *this is a matter of fit*, and any
*if you do not…* opening that offers the reader a way out.

The caveats are real and must be recorded, which is what `note` is for. A rule
whose failure mode is written down is unlike one that gives no warning when it
misfires. A rule that licenses inaction in its instruction field is something
else again, and it is the one to avoid.

**Every `id` in a set must be unique.** An id is how a rule is selected, ignored,
reported and recorded in the lock file, so two rules under one name are
ambiguous, not duplicated. A set with a repeat is turned away, naming the id.

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

**Seven matcher kinds.** A matcher finds occurrences; `notable` settles whether
they are worth reporting. `density` used to be an eighth kind and was removed, because a rate
is a verdict, not a way of matching.

| `match.kind` | fields | finds |
|---|---|---|
| `regex` | `pattern`, `flags`, `distinct` | occurrences of a pattern. Most rules. |
| `chain` | `pattern`, `headTest`, `itemLabel` | `"no X, no Y, no Z"` lists, counting the items |
| `echo` | `minGram`, `minRun`, `anchored`, `minFuncWords` | consecutive sentences sharing a word skeleton |
| `question-chain` | `minRun` | runs of consecutive questions |
| `anaphora` | `minRun` | consecutive sentences opening on the same word |
| `frame` | `gram`, `minRun`, `anchors` | consecutive sentences sharing a *syntactic* frame |
| `rhythm` | `maxSentenceWords`, `minSentenceWords` | nothing: it reports sentence-length variation as a metric |

`distinct` on a `regex` matcher counts how many different things the pattern
matched rather than how many times it matched, and reports only the first of
each. Use it for a word list, where one word repeated because it is the
document's subject should not carry a rate on its own.

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

Two ways to normalise a count by length, and a rule picks one.

`per` is a number, giving a rate per that many words: `count / words × per`.

`power` divides by the length raised to that power: `count / words^power`. Use
it when the count saturates as a document grows — a count of *distinct* things
runs out of new ones to find, so a plain rate falls with length. `power: 0.5`
is the square root, the usual choice. The exponent is a property of the
pattern, not a constant: choose it so one threshold means the same thing on a
short document and a long one.

`per: "root"` was an older spelling of `power: 0.5` and is now refused.

`needs` will not score a document too small for the rate to mean anything:
`{ "words": 250, "sentences": 5, "matches": 2 }`. With `per` set it defaults to
250 words, 5 sentences and a prose filter, so rates keep away from config dumps and diffs.


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

**Fudging.** Each hit example is remade 27 ways with the markup real files
carry, and the rule must still fire:

```
**It is important to note that** this works.   md:bold-span
It is imp**ort**ant to note that this works.   md:bold-inside-word
It is important\nto note that this works.      md:soft-wrap
<p>It is imp<b>ort</b>ant to note that …       html:tag-inside-word
<p>It is important <!-- note --> to note …     html:comment-before-word
<p><span>It</span> <span>is</span> …           html:span-per-word
```

A clean variant that turns a hit into a miss is a bug, either in extraction or in
a rule too tight for real files. Variants that actually delete words (a long
inline code span) are marked lossy and reported for information only.

Write the example first, run `fudge`, then fix what it reports.

## Fixing a noisy rule

A rule that fires constantly usually needs a constraint it does not have.
Deleting it is the last resort, not the first.

Count the hits by rule over a real corpus:

```bash
node /tmp/slop/js/cli.mjs check --format json -r docs/ \
  | jq -r '.files[].findings[].rule' | sort | uniq -c | sort -rn
```

Then read 20 hits of the noisiest rule. The hits themselves tell you the
missing constraint. A worked example is in the repo's `docs/calibration.md`.
`colon-triple` produced 45% of all findings on technical writing, and 16 of its
21 hits were docstrings, matrix algebra and hardware lists, not prose.
Requiring prose characters and a lowercase initial in each item removed every
false positive without losing a single real hit, and the false positives dropped
into `tests.miss`, so the regression is locked in.
