# slop

**[Try it in your browser →](https://bheijden.github.io/slop/)**

A prose linter for `.md`, `.html` and `.txt` files. It flags stock LLM
phrasings — `"it is important to note that"`, `"no X, no Y, no Z"`, three
sentences opening on the same word — and reports each one as
`file:line:col` with a suggested fix.

Rules are **data, not code**. A rule set is a JSON file. The linter is a small
engine that runs five detector kinds over whatever rule sets you point it at,
so adding rules never means touching the linter.

There are two commands, and they do different jobs:

```sh
slop check  docs/ -r                    # lint documents with a set of rules
slop fudge  rules/house-style.json      # test a rule set (alias: test-rules)
```

Everything runs locally. Nothing is uploaded, including by the web page.

---

## Install

**Python** (the primary CLI):

```sh
uv tool install ./py        # or: pip install ./py
slop check docs/ -r
```

**JavaScript** (same behaviour, and the engine the web page uses):

```sh
node js/cli.mjs check docs/ -r
```

**Web** — live at **<https://bheijden.github.io/slop/>**. It needs neither
a build step nor a backend, so any static server works locally too:

```sh
python3 -m http.server 8000    # then http://localhost:8000/web/
```

GitHub Pages serves from the repo root, because `web/index.html` imports
`../js/` and fetches `../rules/`. `.nojekyll` keeps Jekyll out of the way and
the root `index.html` redirects to the app.

Both CLIs and the web page load the same `rules/*.json`. They are checked
against each other in CI, so a finding in one is a finding in all three.

---

## 1. Linting documents

```sh
slop check README.md                  # one file
slop check docs/ -r                   # a tree
slop check https://example.com/post   # a URL: fetched, then treated as HTML
cat draft.md | slop check -           # stdin
```

Output:

```
docs/intro.md (3385 words, 2 findings)
  42:7      note-that             It is important to note that
            It is important to note that timing matters.
            fix: Delete the hedge and state the fact.
  194:86    no-chain          ×3  no residual, no convergence concept, no physics invariant
            fix: Say what it does have. A denial chain lists absences instead of substance.

2 findings in 1 file, 3385 words — 0.59 per 1000 words
```

| flag | effect |
|---|---|
| `--select IDS` | only these rule sets or rules |
| `--ignore IDS` | drop these rule sets or rules |
| `--rules FILE` | load an extra rule set (repeatable) |
| `--all` | include rules marked `"default": "off"` |
| `--format` | `human`, `json`, `tsv`, `github` |
| `--max N` / `--max-per-1000 N` | fail only above a budget |
| `-r`, `--exclude SUBSTR` | walking a tree |

`--select` and `--ignore` take a **set name** or a **single rule id**, the way
ruff accepts both `E` and `E501`.

### For a coding agent

`--format json` gives an agent everything it needs to fix the prose without a
browser:

```sh
slop check --format json -r docs/
```

```json
{
  "file": "docs/intro.md", "line": 42, "col": 7, "endLine": 42, "endCol": 35,
  "rule": "note-that", "set": "wikipedia-ai", "severity": "warn",
  "match": "It is important to note that",
  "sentence": "It is important to note that timing matters.",
  "why": "Didactic hedging: “it is important to note that”, “it’s worth noting” …",
  "suggest": "Delete the hedge and state the fact."
}
```

An agent gets the exact span to replace in `match`, enough context to rewrite it
in `sentence`, and the instruction in `suggest`. Running
`slop explain <rule>` prints the full rule, including examples of what it
flags and what it deliberately allows.

Exit codes: `0` clean, `1` over budget, `2` usage or read error.

---

## 2. Rule sets

### What ships

| set | rules | what it covers |
|---|---|---|
| `llm-cliches` | 27 | Stock phrasings and rhythms models overproduce. From Simon Willison's [LLM cliché highlighter](https://tools.simonwillison.net/llm-cliche-highlighter). |
| `wikipedia-ai` | 11 | Tells catalogued in Wikipedia's [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing). |

```sh
slop list                    # every rule and whether it is active
slop explain note-that       # one rule in full
```

### Choosing sets

```sh
slop check --select wikipedia-ai docs/ -r        # one set
slop check --ignore promo,landscape docs/ -r     # drop two rules
slop check --select colon-triple docs/ -r        # one rule, even though it is off by default
slop check --all docs/ -r                        # everything
```

Or in `slop.json`, found by walking up from the working directory:

```json
{
  "select": ["llm-cliches", "wikipedia-ai"],
  "ignore": ["colon-triple"],
  "ruleSets": ["./rules/house-style.json"],
  "exclude": ["vendor/", "node_modules/"],
  "maxPer1000": 3.0
}
```

The Python CLI also reads `[tool.slop]` from a `pyproject.toml` passed
with `--config`.

Every rule ships enabled. `colon-triple` nearly did not: it produced 45% of all
findings on a real corpus, and 16 of its 21 hits were docstrings, matrix algebra
and hardware lists rather than prose. Tightening the rule beat disabling it — 5
hits, all genuine, with full recall on the examples. See
[docs/calibration.md](docs/calibration.md) for the method.

### Writing your own

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

Drop it in `rules/` to make it a built-in for your repo, or point at it with
`ruleSets` in `slop.json`. The web page loads one through its file picker.

**Five detector kinds.** Most rules are `regex`; the other four are
parameterised algorithms for things a regex cannot express.

| `kind` | fields | detects |
|---|---|---|
| `regex` | `pattern`, `flags` | a pattern. 33 of the 38 built-ins. |
| `chain` | `pattern`, `headTest`, `itemLabel` | `"no X, no Y, no Z"` lists, counting items |
| `echo` | `params.minGram`, `params.minRun` | consecutive sentences sharing a skeleton |
| `question-chain` | `params.minRun` | runs of consecutive questions |
| `anaphora` | `params.minRun` | consecutive sentences opening on the same word |

`tests.hit` and `tests.miss` are required, and they are not decoration — see
below.

---

## 3. Fudging: testing a rule set

```sh
slop fudge examples/house-style.json    # your set
slop fudge                              # every built-in set
```

```
rule sets: llm-cliches, wikipedia-ai  (38 rules)
conformance: 182 pass, 0 fail
fudging:     3066 pass, 0 fail  (86 expected misses on lossy markup)
```

Two phases:

**Conformance** — every `tests.hit` example must match and every `tests.miss`
example must not, on plain text.

**Fudging** — each `hit` example is then rewritten 26 ways, injecting the markup
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

A variant that turns a HIT into a MISS is a bug — in extraction, or in the rule
being too tight for real files. Variants that genuinely delete words (inline
code) are marked lossy and only reported for information.

This is how you refine a rule: write the example, run `fudge`, fix what breaks.
It earned its place immediately — the first run found four real bugs, listed in
[docs/extraction.md](docs/extraction.md).

---

## How it works

Extraction turns a source file into prose plus a map back to source offsets, so
a match found in stripped text still reports the line it came from in the
original file. Three rules, all of them learned from failing fudge variants:

1. **Inline markup is deleted, not blanked.** Blanking turns
   `in<b>ter</b>nal` into three tokens and the rule stops matching.
2. **Block boundaries emit a newline; inline whitespace does not.** HTML
   collapses whitespace and markdown soft-wraps, so a source newline inside a
   paragraph is a *space*. Treating it as a line break puts a false sentence
   boundary at every hard-wrap column — which silently breaks every
   sentence-based rule on any file wrapped at 80 characters.
3. **Long unbroken lines are hard-wrapped.** The sentence detectors rescan from
   every start position, so text with no terminator is O(n²): 8000 words on one
   line takes 4.3 s, the same words split into lines take 31 ms. A 200 KB
   single-paragraph file goes from 89 s to 1.3 s.

Skipped entirely: `<script>`, `<style>`, `<pre>`, `<code>`, fenced and indented
code blocks, front matter, link destinations and reference definitions.

### Repo layout

```
rules/            rule sets as JSON  <- the shared artifact
  llm-cliches.json
  wikipedia-ai.json
  index.json      manifest for the web page
js/               engine.mjs  extract.mjs  config.mjs  fudge.mjs  cli.mjs
py/slop/    engine.py   extract.py   config.py   fudge.py   cli.py
web/              index.html  worker.mjs   <- static, no server
tests/            run.mjs (JS)  test_rules.py (Python)
tools/            build-rules.mjs   regenerate rules/ from vendor/
examples/         a rule set to copy
```

Two engines, one rule format. Each uses its platform's best tools — Python
parses HTML with `html.parser`, the browser has the DOM — but both run the same
rule files against the same test cases, which is what keeps them from drifting.
CI runs both suites.

### Web page

`web/index.html` is a static page: drop a file, pick rule sets, load your own
rule JSON, see hits highlighted over your source with the fix for each. Rules
run in a **Web Worker with a 2-second timeout**, because a user-supplied regex
can backtrack forever and a worker is the only way to kill it without freezing
the tab.

---

## Provenance

The rule patterns come from Simon Willison's
[LLM cliché highlighter](https://tools.simonwillison.net/llm-cliche-highlighter)
([source](https://github.com/simonw/tools/blob/main/llm-cliche-highlighter.html)),
lifted verbatim into `rules/*.json` along with its 182 test cases. A pinned copy
lives in `vendor/`; `node tools/build-rules.mjs` regenerates the rule sets from
it. The `wikipedia-ai` set is adapted there from Wikipedia's
[Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing).

## License

Apache 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE). The rule patterns are
derived from [simonw/tools](https://github.com/simonw/tools), also Apache 2.0.

## Limits

- **English only.** The patterns are hard-coded English. Prose in another
  language passes almost silently — no findings is not evidence of clean prose.
- **Heuristics, not proof.** These are style smells. `ai-vocab` firing once is
  coincidence; several times is a tell. Use `--max-per-1000` rather than
  demanding zero.
- **`.rtf` is not supported.** RTF is a control-word format; it would need
  `striprtf` and would be Python-only. Convert to `.md` or `.txt` first.
- **Inline code is removed, which can leave a gap.** A sentence whose subject is
  an inline code span — ``` `retry_count` is deprecated ``` — becomes
  `" is deprecated"`, and a grammar-sensitive rule such as
  `stranded-auxiliary` may fire on the hole. Dropping the code is still the
  right trade: keeping it produces far more noise. `--ignore stranded-auxiliary`
  if it bothers you in API docs.
- **Markdown tables can trip `echo-triad`.** Column-structured rows look like
  parallel sentences. This repo turns tables off with `"skipTables": true` in
  its own `slop.json`.
