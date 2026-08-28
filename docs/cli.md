# Command line

Everything the CLI does, in one place. The short version lives in the
[README](../README.md).

## Linting documents


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
| `-f`, `--force` | install a rule set even though it fails its own tests |

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

