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
| [`mined`](mined.json) | 83 | Mined AI-slop tells |
| [`style-academic`](style-academic.json) | 11 | Formal scholarly register |
| [`style-conversational`](style-conversational.json) | 8 | Conversational register |
| [`style-economist`](style-economist.json) | 12 | Economist house style |
| [`style-newsroom`](style-newsroom.json) | 10 | Newsroom wire-service style |
| [`style-plain`](style-plain.json) | 11 | Plain English |
| [`variants`](variants.json) | 8 | Rule variants under evaluation |

`mined` holds every tell this project gathered itself, from ten sources that used
to be ten sets. Each rule records where it came from in `from` and `source`, and
what it scored on the audit corpus in `evidence`, so merging the sets did not
lose the provenance. `slop explain <rule>` prints all three.

The five `style-` profiles are registers rather than tells, and are described in
[../docs/styles.md](../docs/styles.md). `variants` is a bench: alternative
formulations of rules that fire on human prose, kept beside the originals so the
two can be measured. See [../research/audit.md](../research/audit.md).

Try one against your own writing:

```sh
slop check --rules candidates/<set>.json --select <set> docs/ -r
slop fudge candidates/<set>.json
```

Anything that survives calibration on a real corpus can graduate into `rules/`.
The method for that is in [../docs/calibration.md](../docs/calibration.md).

See [../research/log.md](../research/log.md) for what was searched, what each
source contributed, and what was rejected.
