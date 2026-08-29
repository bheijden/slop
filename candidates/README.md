# Candidate rule sets

Rules mined from published sources, one set per source, kept out of `rules/` so
they never load by default. They are candidates: unevaluated on real prose, and
some will turn out to be noisy or wrong.

Each set records where it came from in `source`, and carries the same
`tests.hit` / `tests.miss` examples every rule in this project carries, so
`slop fudge candidates/<set>.json` checks it the same way the shipped sets are
checked.

## What is here

| set | rules | what it covers | on 30k words of technical prose | worth turning on |
|---|---|---|---|---|
| [`antislop-fiction`](antislop-fiction.json) | 10 | creative-writing constructions | 0 findings | fiction only |
| [`antislop`](antislop.json) | 12 | essay-register constructions, incl. unqualified not-X-but-Y | 0 findings | on |
| [`economist`](economist.json) | 6 | document-level *rates*: punctuation scarcity, long sentences, nominalisations | 6 findings, 6 documents | tune the thresholds |
| [`slop-gate`](slop-gate.json) | 28 | vocabulary and stock phrases | 3 findings | on |
| [`slopster`](slopster.json) | 7 | reveal-shape openers, cross-sentence negation | 0 findings | on |
| [`sloptells`](sloptells.json) | 14 | tells measured against register-matched human baselines | 35 findings | read the log first |

The last column is a judgement, not a measurement. `sloptells` fires most
often here because its collateral ratings were measured against Hacker News,
cooking and parenting registers, where "rather than" is rarer than it is in
engineering documentation. A tell's collateral does not transfer between
registers, which is why these ship one set per source instead of merged.

`economist` is the odd one out: its rules are `density` rules, which report a
rate for the whole document rather than marking a span, so one finding means
one document rather than one phrase. Its thresholds were measured against a
16-document human corpus and are the first thing you should change.

Try one against your own writing:

```sh
slop check --rules candidates/<set>.json --select <set> docs/ -r
slop fudge candidates/<set>.json
```

Anything that survives calibration on a real corpus can graduate into `rules/`.
The method for that is in [../docs/calibration.md](../docs/calibration.md).

See [../research/log.md](../research/log.md) for what was searched, what each
source contributed, and what was rejected.
