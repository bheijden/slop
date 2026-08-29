# Writing and testing rules

## Contents

- Rule format
- The six detector kinds
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

`description` explains what the rule catches; `suggest` is the instruction an
agent acts on. Both appear in `--format json`, so write `suggest` as a
directive ("Delete the hedge and state the fact"), not a description.

Use it with `--rules ./house-style.json`, drop it in the repo's `rules/`
directory, or point the web page at it with `#rules=<url>`.

## The six detector kinds

| `kind` | fields | detects |
|---|---|---|
| `regex` | `pattern`, `flags` | a pattern — most rules |
| `chain` | `pattern`, `headTest`, `itemLabel` | `"no X, no Y, no Z"` lists, counting the items |
| `echo` | `params.minGram`, `params.minRun` | consecutive sentences sharing a skeleton |
| `question-chain` | `params.minRun` | runs of consecutive questions |
| `anaphora` | `params.minRun` | consecutive sentences opening on the same word |
| `density` | `pattern`, `params.min` or `params.max` | a document-level *rate* rather than a span |

`density` is the odd one out: it reports a rate per 1000 words for the document
as a whole and fires once. `params.min` catches pile-up, `params.max` catches
scarcity. It needs `params.minWords` worth of text (250 by default) and skips
anything that does not read as prose.

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

**Conformance** — every `tests.hit` example must match and every `tests.miss`
example must not, on plain text.

**Fudging** — each hit example is rewritten 27 ways with the markup real files
carry, and the rule must still fire:

```
**It is important to note that** this works.   md:bold-span
It is imp**ort**ant to note that this works.   md:bold-inside-word
It is important\nto note that this works.      md:soft-wrap
<p>It is imp<b>ort</b>ant to note that …       html:tag-inside-word
<p>It is important <!-- note --> to note …     html:comment-before-word
<p><span>It</span> <span>is</span> …           html:span-per-word
```

A lossless variant that turns a hit into a miss is a bug — in extraction, or in
a rule too tight for real files. Variants that genuinely delete words (a long
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
21 hits were docstrings, matrix algebra and hardware lists rather than prose.
Requiring prose characters and a lowercase initial in each item removed every
false positive without losing a single real hit — and the false positives went
into `tests.miss`, so the regression is locked in.
