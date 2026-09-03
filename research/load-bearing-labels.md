# Reproducing load-bearing, and what the signatures add

`rules/load-bearing.json` is a port of an outside measurement. The aim here was
to rebuild it locally and then improve on it, using a fact their method sets aside. Many pull request descriptions include a signature naming the tool that
wrote them.

The rebuild matches, and the signatures back up the result across the
full list without bettering it. Five attempts at an improvement failed, each
for a separate diagnosable reason.

## Definitions

A **signature** is text a tool inserts into a description it wrote, such as
`Generated with Claude Code` or an HTML comment `<!-- CURSOR_AGENT_... -->`.
**Signed** means a description that has one. **Unsigned** means every other
description, which is mostly human, though it does include machine-written text
with the footer stripped. **Group** is one of the ten clusters upstream cuts
the corpus into by word use alone. **Lead group** is the one they publish,
chosen as the largest of recent weeks, then checked for having risen from
under 2 per cent to above 20.

Numbers below come from this repo's audit corpus **as it stood when these
experiments were run**: 80 human and 18 AI documents of general prose, not pull
requests. The two numbers are false alarms, then hits. `data/corpus` now holds
24 matched pairs instead, so these figures cannot be compared directly with any
elsewhere in the repository; they are kept as the record of what each attempt
cost at the time.

## The rebuild matches exactly

Their `analyze.py`, run as published on their published corpus of 609 daily files,
rebuilds their output byte for byte: 467,387 descriptions, lead group 0.86 to
37.43 per cent, and all 1,000 words matching, in matching order. Their own
self-test passes here too. That list scores **1/80, 16/18**, and every number
below is measured against it.

## What the signatures corroborate

All 1,000 of their words show up more often in signed descriptions than in
unsigned ones, at a median of **3.19 times**, over 96,170 signed and 370,641
unsigned. About 80 per cent clear 2.5 times.

Their lead group is **46 per cent signed**. Most of the others land under 5 per
cent, and the smallest is at 0.1.

A method that ignores signatures therefore arrives at the group that is half
self-identified machine writing, and on the words the signatures rank at the top.
That is outside evidence for the shakiest part of their design, which their own
comments call an arrival test conditioned on a retry loop.

## Five ways of using the signatures, and why each failed

| what was tried | result | why |
|---|---|---|
| signatures choose the group | 0/18 | picked WebKit's build tooling at 53 per cent signed |
| signatures rank words in the group | 0/18 | the corpus still held the footers, so it returned the footer |
| the same, with footers cut first | 0/18 | below |
| signatures rank words corpus-wide | 6/18 | subject beat register |
| signatures choose which fit to publish | 16/18 | ties |
| signatures seed 2 of the 10 centres | 16/18 | ties |

**A group can be signed-heavy for reasons that are not about writing.** WebKit's
build infrastructure came out 53 per cent signed because its contributors lean on
these tools, and a Codex fix-up group hit 77 per cent because it simply is
automation. Neither one shows how the writing is put together.

**Ranking inside the lead group removes the contrast.** Measured word by word:

<!-- slop-ignore-start -->
```
             inside the lead group        across the whole corpus
             signed% unsigned%  lift      signed% unsigned%  lift
plainly       1.13     0.81     1.41       0.19     0.04     4.51
carries      12.01    10.54     1.14       2.37     0.69     3.44
```
<!-- slop-ignore-end -->

The unsigned half of that group is machine-written text with no footer, so the
comparison is machine against machine and the lift falls toward one.

**Corpus-wide ranking finds the subject, not the register.** Signed descriptions
cover different work, so the ranking crowds with `compileall`,
`succeeded`, `py_compile`, `tsc`, `pytest`, `--noemit`. Upstream's clustering pulls a way of writing apart from a subject being written
about, and a word-by-word ratio has no way to. That split is what the method rests on.

## The reading

A signature is a fact about **provenance**. A linter needs a fact about
**register**. The two come apart every time. Machine-written and
machine-sounding are separate properties, and the corpus is full of text that
is one but not the other.

The signatures do help in one place, by choosing which of the 8 restarts to publish.
Upstream picks the cheapest, and notes that cost "correlates +0.03 with the share
the page reports", so the cheapest is only the more publishable
of two equal answers. Scoring each fit by how much of its published group is signed is a real
measurement in place of a proxy. On our corpus it ties instead of winning, and
it sheds a retry loop their own comment distrusts.

## Two errors worth recording

The floor on how many unsigned documents a word needs before its ratio counts
was set 3 times, and every time it removed the best words. One term
turns up in 186 signed descriptions and 159 unsigned ones, a ratio of 4.5, under
every floor tried. Uncommon words with big ratios are what a tell looks like,
and a floor tuned for stability strips out precisely them.

The first version of the restart selector scored each fit by its **best** group
instead of the group that would be published, and so chose a fit for a quality
of what it would then discard. Fixing it moved 15/18 to 16/18.

## What is kept here

Nothing from this file is published as a rule. `rules/load-bearing.json` is unaltered apart from
recording the backing evidence above. The reproduction is kept as a recipe (their code
wants numpy, scipy and numba, and this repo wants none of them):

```sh
git clone --depth 1 https://github.com/louisabraham/load-bearing
cd load-bearing && python -m venv .venv && .venv/bin/pip install numpy scipy numba
.venv/bin/python analyze.py --selftest
.venv/bin/python analyze.py
```
