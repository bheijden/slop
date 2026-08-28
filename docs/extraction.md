# What fudging found

The first run of `slop fudge` over the built-in rule sets failed 17 of
3083 variants. All four causes were real bugs, not test artifacts.

| variant | failures | cause | fix |
|---|---|---|---|
| `html:comment-before-word` | 10 | An HTML comment was treated as a block boundary, so `<p>a <!-- x --> b</p>` became two sentences. | Comments emit nothing. Doctype and processing instructions still break blocks. |
| `md:soft-wrap` | 2 | A markdown paragraph hard-wrapped at 80 columns was split into separate lines, so any rule spanning the wrap point stopped matching. | Consecutive prose lines join with a space. Headings, list items, table rows and hard breaks (`  ` at end of line) still break. |
| `html:source-newline` | 2 | Same bug in HTML: a newline inside `<p>` was copied through as a line break, though HTML collapses it to a space. | Whitespace runs inside text nodes collapse to a single space. Block tags still emit newlines. |
| `md:bold-word` and friends | 3 | The fudger was bolding a word *inside a URL* (`utm_**source**=`), which no real document does. | Only whitespace-delimited prose tokens are fudged. |

The soft-wrap bug is the one worth dwelling on, because it failed silently.
Multi-sentence rules simply never fired on any file wrapped at 80 characters,
which is most hand-written markdown, and nothing reported a problem. The rule
tests would never have caught it either, since they use single-line examples.
Only running those examples through markup found it.

That is the argument for keeping `tests.hit` in every rule. The examples are not
there to prove the regex works; they are the raw material for the fudger.
