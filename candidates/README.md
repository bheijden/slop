# Candidate rule sets

Rules mined from published sources, one set per source, kept out of `rules/` so
they never load by default. They are candidates: unevaluated on real prose, and
some will turn out to be noisy or wrong.

Each set records where it came from in `source`, and carries the same
`tests.hit` / `tests.miss` examples every rule in this project carries, so
`slop fudge candidates/<set>.json` checks it the same way the shipped sets are
checked.

## What is here

| set | rules | |
|---|---|---|
| [`style-academic`](style-academic.json) | 9 | Formal scholarly register |
| [`style-conversational`](style-conversational.json) | 8 | Conversational register |
| [`style-economist`](style-economist.json) | 9 | Economist house style |
| [`style-newsroom`](style-newsroom.json) | 6 | Newsroom wire-service style |
| [`style-plain`](style-plain.json) | 10 | Plain English |
| [`unreproduced`](unreproduced.json) | 5 | Tells the audit did not reproduce |

The tells this project mined are not here: they graduated into
[`../rules/mined.json`](../rules/mined.json) and ship on.

The five `style-` profiles are registers rather than tells, and are described in
[../docs/styles.md](../docs/styles.md). `unreproduced` holds patterns published
elsewhere that this repo's corpus measured running the other way, firing on human
documents and not on AI ones; each rule records what was measured. Alternative
formulations of rules that fire on human prose are recorded as specifications in
[../research/audit.md](../research/audit.md) rather than as a set, so nothing
unpromoted sits here waiting to be switched on beside the rule it duplicates.

Try one against your own writing:

```sh
slop check --rules candidates/<set>.json --select <set> docs/ -r
slop fudge candidates/<set>.json
```

Anything that survives calibration on a real corpus can graduate into `rules/`.
The method for that is in [../docs/calibration.md](../docs/calibration.md).

See [../research/log.md](../research/log.md) for what was searched, what each
source contributed, and what was rejected.
