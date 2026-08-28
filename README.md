# slop

**[Try it in your browser →](https://bheijden.github.io/slop/)**

A linter for prose. It flags stock LLM phrasing — `"it is important to note
that"`, `"no X, no Y, no Z"`, three sentences opening on the same word — in
`.md`, `.html`, `.txt` and `.rst`, and reports each one at `file:line:col` with
a suggested fix.

Rules are **data, not code**. A rule set is a versioned JSON file that carries
its own test examples, so adding rules never means touching the linter.

```
docs/intro.md (3385 words, 2 findings)
  42:7      note-that             It is important to note that
            It is important to note that timing matters.
            fix: Delete the hedge and state the fact.
  194:86    no-chain          ×3  no residual, no convergence concept
            fix: Say what it does have. A denial chain lists absences instead of substance.
```

Everything runs locally. Nothing is uploaded, including by the web page.

## Run it

```sh
# one-off, nothing installed
npx --yes github:bheijden/slop check docs/ -r

# repeated use: npx re-resolves the repo each call (~5s), a clone runs in ~0.2s
git clone --depth 1 https://github.com/bheijden/slop
node slop/js/cli.mjs check docs/ -r
```

No dependencies; the clone is 380 KB and needs only Node. Or drop a file, a
folder or a `.zip` on **[the web page](https://bheijden.github.io/slop/)**,
which runs the same engine and rule files.

Findings never fail a run on their own — they are style smells, not errors. Set
a budget when you want CI to gate on them:

```sh
slop check --max-per-1000 2 docs/ -r     # exit 1 above 2 per 1000 words
slop check --format json docs/ -r        # for agents and scripts
slop check --share docs/intro.md         # a link for someone to read
```

## Two commands

```sh
slop check  docs/ -r              # lint documents
slop fudge  rules/mine.json       # test a rule set
```

`fudge` runs each rule's own examples, then rewrites them 27 ways with the
markup real files carry — bold, italics, inline tags, soft-wrapped lines — and
requires the rule to still fire. A rule that survives a clean sentence but not a
real document is a rule that will miss things.

## Rule sets

Two ship, both enabled:

| set | rules | |
|---|---|---|
| `llm-cliches` | 27 | Stock phrasings models overproduce, from Simon Willison's [LLM cliché highlighter](https://tools.simonwillison.net/llm-cliche-highlighter) |
| `wikipedia-ai` | 11 | Wikipedia's [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) |

Install more, write your own, and keep them up to date:

```sh
slop sets                                    # version, active, tests, source
slop add https://example.com/house-style.json
slop update --check                          # what is available
slop restore shared.lock.json                # rebuild a library elsewhere
```

An update that fails its own tests is held back rather than installed.
`.slop/rules.lock.json` records each set's version, source and test
result — commit it and everyone gets the same rules.

## Documentation

| | |
|---|---|
| [Command line](docs/cli.md) | every flag, output formats, exit codes, share links, agent usage |
| [Rule sets](docs/rules.md) | choosing, installing, updating, sharing, and writing your own |
| [Agent skill](docs/skill.md) | installing slop as a skill a coding agent picks up on its own |
| [The web page](docs/web.md) | what the browser version does |
| [How a file is read](docs/extraction.md) | markup stripping, offset mapping, and the bugs that shaped it |
| [Calibrating a rule](docs/calibration.md) | how a rule producing 45% of all findings got fixed rather than disabled |

## Repo layout

```
rules/            rule sets as JSON  <- the shared artifact
js/               engine.mjs  extract.mjs  config.mjs  fudge.mjs
                  library.mjs  zip.mjs  cli.mjs
web/              index.html  worker.mjs      static, no server
skill/            SKILL.md  reference/        the agent skill
tests/            run.mjs                     conformance + fudging
tools/            build-rules.mjs             regenerate rules/ from vendor/
.slop/      rules/  rules.lock.json     installed sets, per project
```

One engine. `js/engine.mjs` and `js/extract.mjs` are what both the CLI and the
web page run; the rule sets are data that they, and any other implementation,
can read.

## Limits

- **English only.** The patterns are hard-coded English. Prose in another
  language passes almost silently — no findings is not evidence of clean prose.
- **Heuristics, not proof.** `ai-vocab` firing once is coincidence; several
  times is a tell. Use a budget rather than demanding zero.
- **Long inline code spans are removed.** A single short token is kept, because
  ``` `retry_count` is deprecated ``` needs its subject to parse. Anything with
  a space in it is a code fragment and is dropped.
- **Markdown tables can trip `echo-triad`.** Set `"skipTables": true` in
  `slop.json`, as this repo does.
- **`.rtf` is not supported.** Convert to `.md` or `.txt` first.

## Provenance and license

Apache 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE). The rule patterns are
derived from [simonw/tools](https://github.com/simonw/tools), also Apache 2.0; a
pinned copy lives in `vendor/` and `node tools/build-rules.mjs` regenerates
`rules/` from it. The `wikipedia-ai` set is adapted there from Wikipedia's
[Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing),
available under CC BY-SA 4.0.
