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
| [`arxiv-slop`](arxiv-slop.json) | 1 | repeated syntactic frames (the paper's Templatedness code) | 0 findings | on |
| [`economist`](economist.json) | 6 | *rates*: punctuation scarcity, long sentences, nominalisations | 6 findings, 6 documents | tune the thresholds |
| [`humanizer-de`](humanizer-de.json) | 2 | sentence-length variation and paired-dash asides | 0 findings | on |
| [`slop-gate`](slop-gate.json) | 28 | vocabulary and stock phrases | 3 findings | on |
| [`slopster`](slopster.json) | 7 | reveal-shape openers, cross-sentence negation | 0 findings | on |
| [`sloptells`](sloptells.json) | 14 | tells measured against register-matched human baselines | 35 findings | read the log first |
| [`structural`](structural.json) | 2 | hedge-then-affirm, and the rhetorical self-interview | 0 findings | on |
| [`style-academic`](style-academic.json) | 11 | *style*: formal scholarly register, citations and hedged claims | 74 findings, 16 documents | pick at most one style |
| [`style-conversational`](style-conversational.json) | 8 | *style*: warm spoken register for consumer software | 28 findings, 12 documents | pick at most one style |
| [`style-economist`](style-economist.json) | 12 | *style*: Economist house style, concrete and active | 21 findings, 11 documents | pick at most one style |
| [`style-newsroom`](style-newsroom.json) | 10 | *style*: wire service, attributed and past tense | 39 findings, 17 documents | pick at most one style |
| [`style-plain`](style-plain.json) | 11 | *style*: Plain English, everyday words and a named actor | 15 findings, 12 documents | pick at most one style |

The last column is a judgement, not a measurement. `sloptells` fires most
often here because its collateral ratings were measured against Hacker News,
cooking and parenting registers, where "rather than" is rarer than it is in
engineering documentation. A tell's collateral does not transfer between
registers, which is why these ship one set per source instead of merged.

The five `style-` sets are read differently from everything above them. A slop
set reports a probable defect, and a finding is a reason to rewrite. A style set
reports that the document is **off target for that register**, which is a
measurement of fit and carries no verdict: good writing sits outside a band all
the time. Their counts in the fourth column are therefore not comparable with
the slop sets' counts and should not be added to them. That corpus is human
technical documentation, which is out of register for all five on purpose, so
the number shows the distance between the corpus and the register rather than a
false-positive rate. Every rule in them is off by default, they use only
`density` and `rhythm` so they cannot mask a slop finding, and at most one of
them should be selected at a time, because two registers contradict each other.
See [../docs/styles.md](../docs/styles.md).

`economist` and `humanizer-de` are the odd ones out: their rules are `density`
and `rhythm` rules, which report a rate for the whole document rather than
marking a span, so one finding means one document rather than one phrase. Their
thresholds were measured against a 16-document human corpus and are the first
thing you should change.

Try one against your own writing:

```sh
slop check --rules candidates/<set>.json --select <set> docs/ -r
slop fudge candidates/<set>.json
```

Anything that survives calibration on a real corpus can graduate into `rules/`.
The method for that is in [../docs/calibration.md](../docs/calibration.md).

See [../research/log.md](../research/log.md) for what was searched, what each
source contributed, and what was rejected.
