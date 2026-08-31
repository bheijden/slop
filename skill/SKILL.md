---
name: linting-prose
description: Lints prose in markdown, HTML and text files for stock language-model phrasing - hedges such as "it is important to note that", "no X, no Y" denial chains, repeated sentence openings, participle tails - and reports each hit as file:line:col with a suggested rewrite. Use when reviewing, editing or proofreading documentation, READMEs, release notes, blog posts or reports; when asked to make writing sound less AI-generated; or when the user mentions slop.
---

# Linting prose

`slop` finds stock LLM phrasing in `.md`, `.html`, `.txt` and `.rst` and
reports it as `file:line:col` with a suggested fix. Rules are JSON files, so a
project can add its own.

## Run it

Point it at whatever the user is working on. That can be a single file, a directory, or
`.` for the whole project. `docs/` in the examples below is only a placeholder.

For a single check, with no install step:

```bash
npx --yes github:bheijden/slop check <paths> -r
```

`npx` re-resolves the repository on every call, which costs about 5 seconds each
time. Fixing findings means running it repeatedly, so clone once instead and the
per-run cost drops to about 0.2s:

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

## Fixing findings

1. Run with `--format json` over the files in question.
2. Rewrite each flagged sentence so the span is gone, following `suggest`. The
   goal is to say the thing plainly, not to paraphrase around the pattern.
3. Re-run. A finding that survives means the rewrite kept the shape.

Do not silence a finding by disabling its rule unless it is a genuine false
positive.

## Handing the result to a person

`--share` prints a link that opens the document in the web page with every
finding marked, so a reviewer reads them without installing anything. The file
is gzipped into the URL fragment, which browsers never send to a server.

```bash
... check --share docs/intro.md
... check --share -r docs/      # one link carrying the whole tree
```

Use it when the person asked for a review rather than a rewrite, or when a
finding is a judgement call that is theirs to make.

## Not every finding is a defect

These are style smells, not errors. `ai-vocab` firing once is coincidence;
several times is a tell. Leave a hit alone when the flagged phrasing is
genuinely the clearest option, and say why rather than rewriting into something
worse.

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
in full, including examples of what it flags and what it deliberately allows.
read this before deciding a finding is wrong.

Two sets ship on: `simonwillison` (27 rules) and `wikipedia-ai` (11), both ports
of published catalogues. The full list is in [reference/rules.md](reference/rules.md).

Two more are in the repository and off by default. `mined` (80 rules) is
everything this project gathered itself, from research papers, style guides and
other detectors; each rule records where it came from and what it scored on a
matched human/AI corpus, which `explain` prints. The `style-` sets (52 rules
across five registers) match a house style rather than hunt tells, and only one
can be selected at a time.

```bash
... check --rules candidates/mined.json --select mined docs/ -r
```

One rule inside `mined` is on wherever that set is loaded: `em-dash`, which flags
every em dash. It is house style rather than a tell, so say so if a user asks why
it fired; `explain em-dash` gives the evidence, which points the other way.

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
rule, because a project's own set can shadow one of ours.

## Writing or fixing a rule

A rule that fires constantly usually needs a constraint it does not have, not
deletion. Read twenty of its hits before concluding it is noise.
[reference/authoring.md](reference/authoring.md) covers the rule format, the
eight detector kinds, and the markup fudger that checks a rule still fires when
its example is wrapped in bold, italics, inline tags or a soft-wrapped line.
