# The back-testing corpus

Twenty-four topics, each written twice. One version is by a person, published
before generative writing tools existed. The other is by a language model given
the topic, the audience and a list of points to cover — and never shown the
human text.

Both halves of a pair therefore say the same things about the same subject, at
roughly the same length, for the same reader. What is left over is register:
how the sentences are put together. That is the only thing a rule here is
allowed to be measuring, because it is the only thing that differs.

```
pairs.json        the index — topic, dates, model, word counts, rights
provenance.md     how each human text was dated, and the cleaning applied
human/<id>.txt
ai/<id>.txt
```

## Twelve registers

`academic` `biography` `forum` `government` `howto` `journalism` `letters`
`literary` `policy` `review` `techdoc` `travel`

Three each of the first six, one each of the rest. Human dates run from 1841 to
October 2021. All machine halves are `claude-opus-5`, written 2026-08-29 and
2026-09-02.

It is what `tools/audit.mjs` scores every rule against, and the reason a rule
either ships or sits in `candidates/`. See
[research/audit.md](../../research/audit.md) for the first pass over it.

## Reading it

```sh
node tools/corpus.mjs                 # summary table
node tools/corpus.mjs --check         # verify every file against its hash
```

`js/corpus.mjs` exports `loadCorpus()` for use in tests. Every human text is a
single excerpt of about a thousand words, kept with its source and date in
`pairs.json` and its collection note in `provenance.md`.

## What it will not tell you

**Twenty-four pairs is small.** A rule that separates them cleanly has
demonstrated that it can separate twenty-four pairs. Treat a result here as a
reason to keep going, not as a measurement.

**The machine halves are one model, prompted one way.** They were written to a
brief that named the register explicitly, so they are a model trying to sound
like the target, not a model writing off the cuff. That is the harder case, and
also a narrow one.

**The human halves skew old.** Half of them predate 1930. Nineteenth-century
prose is unmistakably not machine-written, which makes false alarms on those
files easy to avoid and correspondingly uninformative. The post-2010 human
texts — `government-*`, `journalism-1`, `journalism-3`, `academic-*`,
`techdoc-3`, `forum-*` — are where a false alarm actually costs something.
