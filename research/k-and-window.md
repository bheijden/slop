# How many clusters, and how long a window

Two constants in `tools/pr-cluster.mjs` had never been justified by measurement:
`K = 10` and the archive start date `2025-01-01`. Both were inherited from
[louisabraham/load-bearing](https://github.com/louisabraham/load-bearing).

Everything below fits the whole sampled archive (274,567 pull request
descriptions over 610 days, 2025-01-01 to 2026-09-02) and scores the published
250-word list against `data/corpus`: 24 human documents and 24 machine-written
ones, general prose rather than pull requests. The threshold is set at the
lowest value that keeps false alarms inside a budget, then the machine
documents are counted.

Reproduce with `--dry`, which fits and reports without touching `data/` or
`rules/`:

```sh
node tools/pr-cluster.mjs --k 8 --dry --out /tmp/k8.json
node tools/score-list.mjs /tmp/k8.json
node tools/score-list.mjs --budget 0 /tmp/k8.json
```

## 10 is not the best number of clusters. It is inside a plateau.

| k | published cluster signed | runner-up signed | 1 false alarm | 0 false alarms |
|---|---|---|---|---|
| 6 | 29.8% | 6.1% | 20/24 | 9/24 |
| 8 | 37.7% | 8.5% | **22/24** | **22/24** |
| 9 | 37.7% | 8.2% | 22/24 | 21/24 |
| 10 | 40.6% | 11.8% | 22/24 | 21/24 |
| 11 | 41.7% | 22.0% | 20/24 | 18/24 |
| 12 | 40.2% | 9.6% | 22/24 | 20/24 |
| 14 | 32.9% | 32.2% | 19/24 | 15/24 |
| 16 | 42.0% | 25.0% | 20/24 | 20/24 |

Anywhere from 8 to 12 lands on 20-22 of 24, and the spread across that band is
one or two documents out of 24, which is inside the noise of a corpus this
size. So the answer to "why 10" is that nothing distinguishes it from 8, 9 or
12, and the choice barely matters. `k = 8` is the only value that holds 22 with
no false alarms at all.

The two ends fail for opposite and legible reasons.

**Too few and the register is pooled with its neighbours.** At k = 6 the
published cluster is 20.2% of all descriptions and only 29.8% signed, against
40.6% at k = 10. It has swallowed enough ordinary engineering prose that the
threshold has to rise to 0.43 to keep false alarms at zero, and at that height
it catches 9 of 24.

**Too many and the register splits.** Watch the runner-up column: it sits under
12% up to k = 10, then climbs to 22%, 25%, and at k = 14 to 32.2% against the
published cluster's 32.9%. The machine writing is being cut into two or more
groups of comparable signature density, so whichever one is published is half a
register, and the words that distinguish the two halves from each other rank
above the words that distinguish either from human prose.

That gives a real reason to prefer the middle of the band rather than an
arbitrary point in it: the gap between the published cluster's signed share and
the runner-up's is a measure of whether the register came apart, and it is
widest around k = 9-10.

## The window is doing most of the work, and that is the fragility

The word ranking is a contrast. A word scores by how much more the published
cluster uses it than **the whole rest of the corpus** does. That rest has to be
mostly human for the contrast to be about machine writing at all, and it is
becoming less human every month:

| half-year | share of pull requests in the machine-writing cluster |
|---|---|
| 2025 H1 | 0.1% |
| 2025 H2 | 0.2% |
| 2026 H1 | 15.8% |
| 2026 H2 | 51.0% |

Holding k at 10 and sliding the start date forward measures what that costs:

| window | days | descriptions | 1 false alarm | 0 false alarms |
|---|---|---|---|---|
| 2025-01-01 onward (what ships) | 610 | 274,567 | 22/24 | 21/24 |
| 2026-01-01 onward | 245 | 122,686 | 14/24 | 13/24 |
| 2026-04-01 onward | 155 | 82,019 | **2/24** | 2/24 |

Fitted on recent data alone the method does not degrade, it collapses. Two of
24. The published cluster is still found — 41.9% signed on the last window, the
highest of the three — so the clustering step is fine. It is the ranking that
fails, because by then "everything else" is itself about half machine-written
and the lift on register words falls toward 1.

Note the runner-up column again: 11.8% on the whole archive, 34.0% on 2026,
36.9% on the last five months. The same splitting that k = 14 causes by cutting
too finely, a recent window causes by having too much machine writing to fit in
one cluster.

## What this means for the method

The 2025 data is load-bearing, and `EARLIEST = '2025-01-01'` in
`tools/pr-sample.mjs` is not a detail about how far back the API is convenient
to page. It is the reference period, and it is the reason the list works.

The archive is cumulative, so this does not break on its own: those 152,000
mostly-human descriptions stay in the corpus, and today they are 55% of it.
What erodes is their weight. Every new day adds descriptions to the contrast
side too, and a growing majority of those are machine-written. Extrapolating
the sampling rate, 2025 falls to about a quarter of the archive by late 2027.

Two directions, neither implemented:

**Pin the contrast rather than letting it drift.** Rank against a fixed early
window instead of "the whole rest of the corpus". The contrast then cannot
erode, at the cost of a human baseline that ages — human writing about pull
requests drifts, but far slower than models do.

**Contrast against text that cannot be contaminated.** Anything written before
2023 is clean by construction. The difficulty is that the clustering exists to
hold the subject still, and a pre-2023 corpus of general prose reintroduces
exactly the subject mismatch that clustering was there to remove.

The signature is not a way out. Ranking signed against unsigned inside the
window was tried four times and recorded in
[load-bearing-labels.md](load-bearing-labels.md); it fails because unsigned
text is increasingly machine-written with the footer stripped, so that contrast
is decaying faster than the one it would replace.
