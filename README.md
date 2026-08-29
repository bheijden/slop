# slop

**[Try it in your browser →](https://bheijden.github.io/slop/)**

You asked a model for release notes. It gave you this:

<!-- slop-ignore-start -->
> It is important to note that the rollout happened in stages. No sign-ups, no
> downloads, no hassle. Community feedback plays a pivotal role in every
> release, underscoring the value of an ever-evolving landscape.
>
> The parser is a tiny state machine. The renderer is a tiny state machine.
<!-- slop-ignore-end -->

It reads fine and says almost nothing. `slop` shows you where, and what to do
about it:

```console
$ slop check release-notes.md

release-notes.md (49 words, 5 findings)
  3:1       note-that             It is important to note that
            fix: Delete the hedge and state the fact.
  3:62      no-chain          ×3  No sign-ups, no downloads, no hassle
            fix: Say what it does have. A denial chain lists absences instead of substance.
  4:42      crucial-role          plays a pivotal role
            fix: Say what it actually does.
  4:79      participle-tail       , underscoring the value of an ever-evolving landscape
            fix: End the sentence. The participle tail adds commentary, not information.
  7:1       echo-triad        ×2  The parser is a tiny state machine. The renderer is …
            fix: Merge the parallel sentences into one, or vary the structure.

5 findings in 1 file, 49 words — 102.04 per 1000 words
```

Or drop the file on **[the page](https://bheijden.github.io/slop/)** and read it
the same way. Same engine, same rules, nothing uploaded:

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/img/slop-dark.png">
    <img src="docs/img/slop-light.png" alt="slop in the browser: a document with findings highlighted, and a list beside it giving the rule and the fix for each" width="900">
  </picture>
</p>

It works on `.md`, `.html`, `.txt` and `.rst`, and on a whole directory. Rules
are **data, not code**: a rule set is a versioned JSON file carrying its own
test examples, so adding rules never means touching the linter.

## Run it

```sh
# one-off, nothing installed
npx --yes github:bheijden/slop check docs/ -r

# repeated use: npx re-resolves the repo each call (~5s), a clone runs in ~0.2s
git clone --depth 1 https://github.com/bheijden/slop
node slop/js/cli.mjs check docs/ -r
```

No dependencies; the clone is 380 KB and needs only Node.

Findings never fail a run on their own. They are style smells, not errors. Set
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
markup real files carry (bold, italics, inline tags, soft-wrapped lines) and
requires the rule to still fire. A rule that survives a clean sentence but not a
real document is a rule that will miss things.

## Rule sets

Two ship, both enabled:

| set | rules | |
|---|---|---|
| `simonwillison` | 27 | Stock phrasings models overproduce, from Simon Willison's [LLM cliché highlighter](https://tools.simonwillison.net/llm-cliche-highlighter) |
| `wikipedia-ai` | 11 | Wikipedia's [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) |
| `em-dash` | 1 | House style: no em dashes, anywhere. Not a detection claim; `slop explain em-dash` says why |

Install more, write your own, and keep them up to date:

```sh
slop sets                                    # version, active, tests, source
slop add https://example.com/house-style.json
slop update --check                          # what is available
slop restore shared.lock.json                # rebuild a library elsewhere
```

An update that fails its own tests is held back rather than installed.
`.slop/rules.lock.json` records each set's version, source and test
result. Commit it and everyone gets the same rules.

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
                  web.mjs                     headless smoke test for the page
tools/            build-rules.mjs             regenerate rules/ from vendor/
.slop/      rules/  rules.lock.json     installed sets, per project
```

One engine. `js/engine.mjs` and `js/extract.mjs` are what both the CLI and the
web page run; the rule sets are data that they, and any other implementation,
can read.

## Limits

- **English only.** The patterns are hard-coded English. Prose in another
  language passes almost silently. No findings is not evidence of clean prose.
- **Heuristics, not proof.** `ai-vocab` firing once is coincidence; several
  times is a tell. Use a budget rather than demanding zero.
- **Long inline code spans are removed.** A single short token is kept, because
  ``` `retry_count` is deprecated ``` needs its subject to parse. Anything with
  a space in it is a code fragment and is dropped.
- **Markdown tables can trip `echo-triad`.** Set `"skipTables": true` in
  `slop.json`, as this repo does.
- **`.rtf` is not supported.** Convert to `.md` or `.txt` first.

To quote bad prose on purpose — as this README does above — wrap it in
`<!-- slop-ignore-start -->` and `<!-- slop-ignore-end -->`. Works in markdown
and HTML.

## Provenance and license

Apache 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE). The rule patterns are
derived from [simonw/tools](https://github.com/simonw/tools), also Apache 2.0; a
pinned copy lives in `vendor/` and `node tools/build-rules.mjs` regenerates
`rules/` from it. The `wikipedia-ai` set is adapted there from Wikipedia's
[Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing),
available under CC BY-SA 4.0.
