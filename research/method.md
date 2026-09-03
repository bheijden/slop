# Reproducing load-bearing, and the one place the signature improves on it

`rules/slop-vocabulary.json` is derived by a method that is
[louisabraham/load-bearing](https://github.com/louisabraham/load-bearing) with a
single deliberate change. This file records what was tried, what was measured,
and what was wrong along the way.

## The one change

They choose which of ten clusters to publish by watching it grow. The published
cluster is the one that went from under 2% of all pull requests to over 20%.
We choose it by the share of its descriptions carrying a tool signature.

Measured over four fits of the full archive:

| fit | their growth test | signature | best available |
|---|---|---|---|
| df 100, seed 12345 | two candidates → 5/24 | **7 → 20/24** | 20/24 |
| df 100, seed 777 | two candidates → 20/24 | **6 → 20/24** | 20/24 |
| df 25, seed 12345 | two candidates → 5/24 | **7 → 20/24** | 20/24 |
| df 50, seed 12345 | two candidates → 10/24 | **7 → 22/24** | 22/24 |

The growth test admitted two clusters every time. Taking the larger of them
picks wrong in three of the four. The signature picks the best available cluster
in all four, and by a wide margin: in the winning fit the published cluster is
41% signed and the runner-up is 18%.

There is a second reason to prefer it. Growth identifies machine writing only
for as long as machine writing is still arriving. Once the share stops climbing,
the test stops working. A signature does not have that expiry.

## Four departures that were mistakes

Each of these was adopted without being measured against the alternative, and
each cost accuracy. They are recorded because the pattern matters more than the
individual errors: every one was a quiet convenience that was never checked.

**Clustering a 40-day window instead of the whole archive**, chosen for
"freshness". It cost six of the twenty-four documents and left a list whose top
hundred words matched theirs 62 times out of 100. Fitting all 609 days at once
matches 100 out of 100. This is the single largest factor.

**Ten clusters reduced to five.** Adopted to compensate for the small window,
where ten clusters split the machine writing in two. On the full archive ten is
correct and five is not needed.

**A prose filter that discarded 39% of the sample.** `TOKENS_MIN` of 25 and a
requirement that 12% of tokens be English function words. Theirs keeps anything
over five words. On one day this is 609 descriptions kept against 903.

**An invented filter that dropped words appearing in only one cluster.** It
helped the 40-day method by about one document. On the full-archive fit it costs
between five and ten, at every list length. It was compensating for a broken
fit, not adding anything.

## What the signature is not good for

Recorded because each was tried and failed.

**Ranking words.** Scoring words by how much more the signed half uses them
returns `bugbot` (462x, a tool's name) and `nbsp` (57x, an HTML escape). It
finds what AI is asked to do, not how it writes, and it has no term for rarity,
so common words outrank distinctive ones. 9 of 24.

**Ranking words inside the published cluster.** The unsigned half of that
cluster is mostly machine writing with the footer stripped, so the comparison is
machine against machine and every ratio collapses toward one.

**Judging a cluster by whether its two halves look alike.** The idea was that a
cluster of machine writing would have signed and unsigned halves that a
classifier cannot separate. It correlates with the truth at rho 0.67 but picks
the wrong cluster.

**A validation set built from the corpus itself**, pitting signed descriptions
against unsigned ones drawn from the least-signed clusters. rho 0.52, and it too
picks the wrong cluster.

Only cluster selection worked, and it worked completely.
