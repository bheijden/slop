# Why `colon-triple` is off by default

Rules ship off by default only with evidence, not on a hunch.

Every built-in rule was run over 29k words of real technical writing — internal
reports, troubleshooting notes and design documents, the kind of prose this
linter is actually pointed at. Findings, all rules enabled:

| rule | findings | share |
|---|---|---|
| `colon-triple` | 22 | 48% |
| `echo-triad` | 8 | 17% |
| `no-chain` | 7 | 15% |
| `ai-leftovers` | 2 | 4% |
| `not-just` | 2 | 4% |
| `is-real` | 2 | 4% |
| `x-is-dead` | 1 | 2% |
| `stranded-auxiliary` | 1 | 2% |
| `ai-vocab` | 1 | 2% |

`colon-triple` produced nearly half of all findings on its own, and almost none
of them were clichés. They were structural lists — `"Perception, Planning,
Actuation, Orchestration"`, `": Intel CNVi, hci0, BlueZ 5"` — plus source code
and REPL transcripts that had leaked past extraction. Upstream says the same in
the rule's own description: *"Noisy in technical writing — leave it off by
default if your corpus is documentation."*

Two rules were nearly disabled on intuition and then kept: `x-is-dead` and
`stranded-auxiliary` each produced exactly one finding over 29k words, and both
looked like true positives. A guess would have removed two working rules.

Turn it on when you want it:

```sh
slop --all docs/                 # every rule
slop --select colon-triple docs/ # just this one
```

## Re-running the calibration

```sh
slop --all --format json -r <your-corpus> \
  | jq -r '.files[].findings[].rule' | sort | uniq -c | sort -rn
```

A rule producing a large share of findings is not automatically wrong — but it
is worth reading twenty of its hits before leaving it on for a whole team.
