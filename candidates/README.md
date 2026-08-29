# Candidate rule sets

Rules mined from published sources, one set per source, kept out of `rules/` so
they never load by default. They are candidates: unevaluated on real prose, and
some will turn out to be noisy or wrong.

Each set records where it came from in `source`, and carries the same
`tests.hit` / `tests.miss` examples every rule in this project carries, so
`slop fudge candidates/<set>.json` checks it the same way the shipped sets are
checked.

Try one against your own writing:

```sh
slop check --rules candidates/<set>.json --select <set> docs/ -r
slop fudge candidates/<set>.json
```

Anything that survives calibration on a real corpus can graduate into `rules/`.
The method for that is in [../docs/calibration.md](../docs/calibration.md).

See [../research/log.md](../research/log.md) for what was searched, what each
source contributed, and what was rejected.
