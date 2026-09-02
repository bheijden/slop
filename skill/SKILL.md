---
name: linting-prose
description: Lints prose in markdown, HTML and text files for stock language-model phrasing - hedges such as "it is important to note that", "no X, no Y" denial chains, repeated sentence openings, participle tails - and for document-level rates such as how far a vocabulary spreads across a known cluster. Reports each hit as file:line:col with a suggested rewrite. Use when reviewing, editing or proofreading documentation, READMEs, release notes, blog posts or reports; when asked to make writing sound less AI-generated; or when the user mentions slop.
---

# Linting prose

`slop` finds stock LLM phrasing in `.md`, `.html`, `.txt` and `.rst` and
reports it as `file:line:col` with a suggested fix. Rules are JSON files, so a
project can add its own.

## Run it

Point it at the file the user is working on. That can be a single file, a directory, or
`.` for the whole project. `docs/` in the examples below is only a placeholder.

For a single check, with no install step:

```bash
npx --yes github:bheijden/slop check <paths> -r
```

`npx` re-resolves the repository on every call, which costs about 5 seconds each
time. Fixing findings means running it repeatedly, so clone once instead and the
the cost per run falls to about 0.2s:

```bash
git clone --depth 1 https://github.com/bheijden/slop /tmp/slop
node /tmp/slop/js/cli.mjs check docs/ -r
```

There are no dependencies to install; the clone is about 1.4 MB and needs only Node.

Use `--format json` whenever you intend to act on the findings:

```bash
node /tmp/slop/js/cli.mjs check --format json docs/ -r
```

Each finding carries everything needed to fix it:

```json
{ "file": "docs/intro.md", "line": 42, "col": 7,
  "rule": "note-that", "set": "wikipedia-ai", "severity": "warn",
  "match": "It is important to note that",
  "sentence": "It is important to note that timing matters.",
  "why": "Didactic hedging: \"it is important to note that\" ...",
  "suggest": "Delete the hedge and state the fact." }
```

Replace the span in `match`. Use `sentence` for the surrounding context, and
follow `suggest` for the rewrite.

A rule that measures a rate reports the document instead of a phrase. It sets
`docLevel`, and carries the numbers in `rate` and the places they came from in
`occurrences`:

```json
{ "file": "docs/intro.md", "docLevel": true,
  "rule": "load-bearing-vocabulary",
  "measure": "48 in 862 words, 1.63 per root word >= 1.2",
  "rate": { "value": 1.63, "per": "root", "unit": "words",
            "op": ">=", "threshold": 1.2, "count": 48, "words": 862 },
  "occurrences": [ { "line": 3, "col": 5, "match": "carrying", "context": "…" } ] }
```

There is no single span to replace. Rewrite until the rate falls under
`rate.threshold`. When the rule is a word list, the run also carries a
top-level `vocabularies` object naming every word in it, so you can avoid
swapping one flagged word for another from the same list:

```json
{ "vocabularies": { "load-bearing-vocabulary": ["plainly", "quietly", "…"] } }
```

## Fixing findings

1. Run with `--format json` over the files in question.
2. Rewrite each flagged sentence so the span is removed, following `suggest`. The
   goal is to say it in plain words, not to paraphrase around the pattern.
3. Run it again. A finding that remains means the rewrite kept the same form.

Do not mute a finding by disabling its rule unless it is a genuine false
positive.

## Giving the result to a person

`--share` prints a link that opens the document in the web page with every
finding marked, so a reviewer can see them without installing anything. The file
is gzipped into the URL fragment, which browsers never send to a server.

```bash
... check --share docs/intro.md
... check --share -r docs/      # one link carrying the whole tree
```

Use it when the person asked for a review and not a rewrite, or when a
finding is a judgement call for them to make.

## Keeping a finding

Some findings are the right call to leave. Two things make that decision sound.

**The fix is an instruction, not a question.** `suggest` says what to do. Where a
rule has a known exception it is recorded in `note`, and `explain` prints it.
A finding closed on the strength of something the rule itself claims should cite
`note`, not a reading of the instruction.

**Read the rule before deciding.** `explain <id>` prints `note` and `measured`
alongside the fix. `note` says what the rule is known to get wrong, which is the
place a genuine exception is described. `measured` says when and how a tell was
measured; where it reports that a tell does not indicate authorship, that is a
statement about detection and not a licence to skip the rule.

**A house-style rule is not a judgement call.** `em-dash` is the example, because the
evidence says em dashes do not indicate a machine wrote something, and the rule
exists because the owner does not want them. Keeping 99 of them because
the research is equivocal is the wrong reading. If a project should keep its em
dashes, say so and add `--ignore em-dash` once, instead of defending each hit.

**A rate is not an occurrence.** `rather-than` and the other rate rules fire
on the whole document, not on a phrase, and the badge shows the rate. Fix them by
<!-- slop-ignore-start -->
varying, not by replacing every instance with the same thing: swapping every
"rather than" for "not X" trades one tic for another.
<!-- slop-ignore-end -->

## Not every finding is a fault

These are style smells, not errors. `ai-vocab` firing once means little;
several times is a tell. Leave a hit as it stands when the flagged phrasing is
the clearest option. Say why, and leave it.

Findings never fail a run on their own. Set a budget when you want one to:

```bash
... check --max-per-1000 2 docs/ -r    # fail above 2 findings per 1000 words
... check --max 0 docs/ -r             # fail on any finding
```

Exit codes: `0` ok, `1` over a budget you set, `2` usage or read error. In CI,
use `--format github` for inline pull-request annotations.

## Choosing rules

`--select` and `--ignore` take a rule-set name or a single rule id:

```bash
... check --select wikipedia-ai --ignore promo docs/ -r
... check --rules ./house-style.json docs/ -r
```

`list` shows every rule and whether it is active. `explain <rule-id>` shows one
in full, including examples of what it flags and what it allows on purpose.
read this before deciding a finding is wrong.

Four sets ship on. `simonwillison` (27 rules) and `wikipedia-ai` (11) are both ports
of published catalogues, and `ai-tells` (78), everything this project gathered
itself from research papers, style guides and other detectors. Each mined rule
records where it came from and what it measured on a matched human/AI corpus, and
`explain` prints both. The built-in catalogue is in
[reference/rules.md](reference/rules.md).

Every rule in those sets runs; none is held back. `load-bearing` is the 4th set
and holds one rule, measuring how far a document's vocabulary spreads across a
cluster of 461,000 pull request descriptions. It is rebuilt from upstream by CI
rather than written here, so its version moves on its own.

The five patterns the audit measured on human prose and not on AI prose are in
`candidates/unreproduced.json`, off, and turning one on means accepting findings
the measurement says are not evidence of AI authorship.

The five `style-` sets are off by default. They match a house style instead of
hunting tells; only one can be selected at a time.

```bash
... check --rules candidates/style-plain.json --select style-plain docs/ -r
```

One rule inside `ai-tells` is on wherever that set is loaded. `em-dash` flags
every em dash. It is house style, not a tell, so say so if a user wants to know why
it reported; `explain em-dash` gives the evidence, which points the other way.

A project can install more. Rule sets are versioned packages, recorded in
`.slop/rules.lock.json` with their source and test status:

```bash
... sets                       # version, rules, active, tests, source
... add https://example.com/house-style.json
... update --check             # what is available from each source
... restore shared.lock.json   # rebuild a library elsewhere
```

Every rule carries its own examples in the same file, so `add`, `update` and
`restore` run them before installing and hold back a set that fails. `--force`
installs it anyway. Check `sets` before assuming a finding came from a built-in
rule, because a project's own set can shadow a built-in.

## Writing or fixing a rule

A rule that fires constantly usually needs a constraint it does not have, not
deletion. Read 20 of its hits before concluding it is noise.
[reference/authoring.md](reference/authoring.md) covers the rule format, the
the detector kinds, and the markup fudger that checks a rule still fires when
its example is wrapped in bold, italics, inline tags or a soft-wrapped line.
