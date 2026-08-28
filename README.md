# slop

**[Try it in your browser →](https://bheijden.github.io/slop/)**

A prose linter for `.md`, `.html`, `.txt` and `.rst` files. It flags stock LLM
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

## Two ways to run it

**CLI** — one engine, no dependencies:

```sh
# one-off, nothing installed
npx --yes github:bheijden/slop check docs/ -r

# repeated use: npx re-resolves the repo every call (~5s), a clone runs in ~0.2s
git clone --depth 1 https://github.com/bheijden/slop
node slop/js/cli.mjs check docs/ -r
```

**The web page** — <https://bheijden.github.io/slop/>. Paste text, or drop
a file, several files, a folder or a `.zip`. Findings are highlighted with the
fix on hover and listed beside the document.

Several files read like a diff view: every document renders in one continuous
scroll, the findings pane runs straight through all of them, and next/prev
crosses file boundaries. A file list on the left shows which file you are in as
you scroll, and jumps you to any of them. All three columns collapse from the
dividers between them. **copy JSON** puts the whole result on the clipboard.
Nothing is uploaded.

Both load the same `rules/*.json` and run the same `js/engine.mjs`.

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
| `--rules FILE\|URL` | load an extra rule set, from disk or over https (repeatable) |
| `--all` | include rules marked `"default": "off"` |
| `--format` | `human`, `json`, `tsv`, `github` |
| `--max N` / `--max-per-1000 N` | fail only above a budget |
| `-r`, `--exclude SUBSTR` | walking a tree |
| `--share` | print a link that opens these files in the web page |

`--select` and `--ignore` take a **set name** or a **single rule id**, the way
ruff accepts both `E` and `E501`.

### What the flags mean

| flag | what it does |
|---|---|
| `-r` | Recurse into directories. `slop check docs/ -r` walks the whole tree and lints every `.md`, `.html`, `.txt` and `.rst` it finds, skipping dotfiles and `node_modules`. Without it, pointing at a directory is an error. |
| `--max N` | A **budget**, off by default. Findings are style smells, not errors, so a run does not fail just because it found some. `--max 5` means "fail if there are more than 5"; `--max 0` means "fail on any". |
| `--max-per-1000 N` | A budget scaled by length, which is the one you usually want: a 20-page document is allowed more findings than a paragraph. `--max-per-1000 2` fails above 2 findings per 1000 words. |
| exit codes | `0` ok, `1` over a budget you set, `2` bad usage or unreadable file. Without a budget it is always `0` — set one to make CI or a pre-commit hook gate on prose. |
| `--format json` | The full result as JSON: every finding with `file`, `line`, `col`, `rule`, `match`, `sentence`, `why` and `suggest`. For agents and scripts. |
| `--format github` | GitHub Actions annotation lines (`::warning file=…,line=…::`). GitHub renders these as inline comments on the changed lines of a pull request. |
| `--share` | Prints a **link** that opens the document in the web UI, with the file gzipped into the URL fragment. Nothing is uploaded — the fragment never leaves the browser. It is for handing a result to someone who has nothing installed. |

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

Exit codes: `0` ok, `1` over a budget you set, `2` usage or read error. Findings
alone never fail a run.

### Opening a web page from a script

`--share` turns a local file into a link. The document is gzipped into the URL
**fragment**, which browsers never send to a server, so the text stays on the
two machines that already have it. A 3 KB markdown file becomes a 2.2 KB link.

```sh
slop check --share docs/intro.md
# https://bheijden.github.io/slop/#gz=H4sIAAAA…&kind=md&name=intro.md

slop check --share -r docs/
# one #bundle= link carrying every file, so the page opens the whole tree
```

Or build one by hand:

| fragment key | effect |
|---|---|
| `url=https://…` | fetch that page and lint it |
| `text=<base64url>` | lint text you encoded |
| `gz=<base64url>` | same, gzipped — what `--share` emits for one file |
| `bundle=<base64url>` | several files: gzipped JSON, what `--share` emits for a directory |
| `kind=md\|html\|txt` | how to parse it |
| `rules=https://…` | load a rule set over https (repeatable) |
| `select=`, `ignore=` | choose rule sets or rules |
| `mode=fudge` | test rule sets instead of linting a document |

| `name=` | a filename to label the result with |

`url=` needs the target site to allow cross-origin reads; the CLI has no such
limit, so prefer `slop check <url> --share` when it does not.

An agent working in a terminal should use `--format json` directly. The links
are for reaching someone with nothing installed.

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

Every rule ships enabled. `colon-triple` nearly did not: it produced 45% of all
findings on a real corpus, and 16 of its 21 hits were docstrings, matrix algebra
and hardware lists rather than prose. Tightening the rule beat disabling it — 5
hits, all genuine, with full recall on the examples. See
[docs/calibration.md](docs/calibration.md) for the method.

### Installing rule sets

A rule set is a package. It carries its own `name` and `version`, and the
`slop` version it was built against:

```json
{ "name": "house-style", "version": "1.1.0", "slop": "0.1.0",
  "title": "Our house style", "rules": [ … ] }
```

`add` downloads one into `.slop/rules/`, beside your `slop.json`.
It is compiled and run through its own tests on the way in, then becomes active
immediately — you do not pass a flag or edit the config:

```sh
slop add https://example.com/house-style.json
slop add https://example.com/rules/index.json    # a manifest: several at once
slop add ./local-set.json
```

A URL can hold one set, an array of sets, or a `{"sets": [...]}` manifest naming
files beside it — the shape this repo's own `rules/index.json` uses, so
`slop add <that url>` installs both of ours.

```sh
slop sets                # version, rule count, active, tests, source
```

```
SET                   VERSION   RULES  ACTIVE  TESTS       SOURCE
llm-cliches           v1.0.0       27  all     pass        built-in
wikipedia-ai          v1.0.0       11  all     pass        built-in
house-style           v1.1.0        2  all     pass        https://example.com/house-style.json

library: .slop/rules/  lock: .slop/rules.lock.json  engine: slop 0.1.0
```

### Updating

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

**A candidate that fails its own tests is never installed.** It is reported and
the working version stays:

```
held back house-style 1.0.0 → 1.2.0  2 failing — not installed
```

That is the point of shipping tests inside a rule set: an update from a source
you do not control is checked before it can affect your CI. A set built against
a newer `slop` than yours is flagged too, since it may use a detector kind
this engine does not have.

### Sharing a library

The lock file is the portable artifact. Commit it, or hand it to someone:

```sh
slop restore                     # from .slop/rules.lock.json
slop restore shared.lock.json    # from anywhere
```

Each set is re-fetched from its recorded source and tested. If the source now
serves something different from what the lock recorded, you are told:

```
restored house-style v1.1.0 2 rules  differs from the lock (1.0.0 → 1.1.0)
```

Committing `.slop/rules/` as well pins the exact files; committing only
the lock keeps them fresh. `slop fudge` tests the built-ins, the library
and anything in `ruleSets` together. Installed rules face the same two phases
that ours face.

An installed set **shadows** a built-in of the same name, so you can pin or
customise the rules that ship here by installing your own `llm-cliches`.

Turn one off with `--ignore <name>`, or in `slop.json`:

```json
{ "ignore": ["draft-voice"] }
```

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
slop fudge examples/house-style.json    # one set
slop fudge                              # every built-in set, plus any
                                              # `ruleSets` in slop.json
```

The web page runs the same thing under **test rules**, with failures sorted to
the top — useful while you are still writing the pattern.

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

That is how you refine a rule. Write the example, run `fudge`, and fix whatever
it reports.
It earned its place immediately — the first run found four real bugs, listed in
[docs/extraction.md](docs/extraction.md).

---

## 4. Installing it as an agent skill

The repo ships a [`skill/SKILL.md`](skill/SKILL.md) so a coding agent picks
slop up on its own when it is editing prose, rather than having to be told
to run it.

```sh
D=~/.claude/skills/linting-prose        # or .claude/skills/… to scope it to one project
R=https://raw.githubusercontent.com/bheijden/slop/main/skill

mkdir -p $D/reference
curl -sL $R/SKILL.md -o $D/SKILL.md
for f in rules authoring; do curl -sL $R/reference/$f.md -o $D/reference/$f.md; done
```

Or hand the instruction to the agent and let it install itself:

> Install the slop skill from
> `github.com/bheijden/slop/tree/main/skill` into
> `~/.claude/skills/linting-prose/`, keeping the `reference/` files. Then lint
> `docs/` and fix what it reports.

Only `name` and `description` sit in context until the skill triggers, so it
costs roughly 100 tokens to have installed. The body loads when the agent is
actually editing prose; `reference/rules.md` (the rule catalogue) and
`reference/authoring.md` (rule format and the fudger) load only when needed.
`reference/rules.md` is generated by `tools/build-rules.mjs`, so it cannot drift
from the rules themselves.

A skill is instructions an agent will act on, so read one before installing it —
this one runs `npx` against this repo and nothing else. See Anthropic's
[Agent Skills documentation](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
and [authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices).

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
  index.json      manifest the web page reads
js/               engine.mjs  extract.mjs  config.mjs  fudge.mjs  cli.mjs
                  zip.mjs      minimal ZIP reader, no dependencies
web/              index.html   the web page
                  worker.mjs   runs rules off the main thread, with a timeout
skill/            SKILL.md     the agent skill
                  reference/   rule catalogue (generated) + authoring guide
tests/            run.mjs      conformance + fudging
.slop/      rules/       sets installed with `slop add` (per project)
tools/            build-rules.mjs   regenerate rules/ from vendor/
examples/         a rule set to copy
```

One engine. `js/engine.mjs` and `js/extract.mjs` are what both the CLI and the
web page run; the rule sets are data that they, and any other implementation,
can read.

### Web page

`web/index.html` is a static page. Paste text, or drop a file, several files, a
folder or a `.zip` anywhere on it. Non-text files are counted and skipped rather
than failing.

Findings are highlighted in the document, and hovering one shows the rule and
its fix. Read them over the extracted prose or over your original source. The
findings list sits beside the document; **copy JSON** puts the whole result on
the clipboard in exactly the shape `--format json` writes, so it pastes straight
into an issue, a review or an agent's context.

More than one file reads like a diff view: every document renders in one
continuous scroll, the findings pane runs through all of them grouped by file,
and next/prev crosses file boundaries. A file list on the left shows which file
you are in as you scroll and jumps you to any of them.

Three columns — files, document, findings — separated by dividers you can drag
to resize or step left and right to collapse. A theme control in the bar chooses
light, dark or the system setting, because a browser forced to dark for every
site should not force it here. The page grows with the window, with a side
margin that widens to a cap.

Two voices carry the design: everything the linter says is monospace, everything
you wrote is serif.

Rules run in a **Web Worker**, which the page terminates if a run takes too long.
A regex from a rule set you fetched can backtrack forever, and a worker is the
only way to kill that without freezing the tab. The timeout starts only after
the worker reports ready, so a slow network is never mistaken for a runaway
rule.

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
- **`.rtf` is not supported.** RTF is a control-word format and would need a
  real parser. Convert to `.md` or `.txt` first.
- **Long inline code spans are removed.** A single short token is kept, because
  ``` `retry_count` is deprecated ``` needs its subject to parse. Anything with
  a space in it — ``` `npm test && node run.mjs` ``` — is a code fragment and is
  dropped, which can leave a gap a grammar-sensitive rule fires on.
- **Markdown tables can trip `echo-triad`.** Column-structured rows look like
  parallel sentences. This repo turns tables off with `"skipTables": true` in
  its own `slop.json`.
