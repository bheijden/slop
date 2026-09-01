# How a file is read

To exclude a region deliberately, such as a quoted example of bad prose or a
block you do not want linted, wrap it in `<!-- slop-ignore-start -->` and
`<!-- slop-ignore-end -->`. Both markdown and HTML honour it.



Extraction turns a source file into prose plus a map back to source offsets, so
a match found in stripped text still reports the line it came from in the
original file. Three rules, all of them learned from failing fudge variants:

1. **Inline markup is deleted, not blanked.** Blanking turns
   `in<b>ter</b>nal` into three tokens and the rule stops matching.
2. **Block boundaries emit a newline; inline whitespace does not.** HTML
   collapses whitespace and markdown soft-wraps, so a source newline inside a
   paragraph is a *space*. Treating it as a line break puts a false sentence
   boundary at every hard-wrap column, which silently breaks every
   sentence-based rule on any file wrapped at 80 characters.
3. **Long unbroken lines are hard-wrapped.** The sentence detectors rescan from
   every start position, so text with no terminator is O(n²): 8000 words on one
   line takes 4.3 s, the same words split into lines take 31 ms. A 200 KB
   single-paragraph file goes from 89 s to 1.3 s.

Skipped entirely: `<script>`, `<style>`, `<pre>`, `<code>`, fenced and indented
code blocks, front matter, link destinations and reference definitions.

---

## What fudging found

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

That is the argument for keeping `tests.hit` in every rule. The examples are the
raw material for the fudger, not a demonstration that the regex works.
