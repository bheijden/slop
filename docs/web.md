# The web page

<https://bheijden.github.io/slop/>



`web/index.html` is a static page. It opens on an example already linted, so
the first thing on screen is the thing working; **clear** empties it. Paste
text, or drop a file, several files, a folder or a `.zip` anywhere on it.
Non-text files are counted and skipped rather than failing.

Three pages share one layout: **check** lints what you give it, **rule sets**
runs a rule set against its own examples, and **PR vocabulary** shows where the
derived word list comes from. The left column is the same on all three.

Findings are highlighted in the document, and hovering one shows the rule and
its fix. Read them over the extracted prose or over your original source. The
findings list sits beside the document; **copy JSON** puts the whole result on
the clipboard in exactly the shape `--format json` writes, so it pastes straight
into an issue, a review or an agent's context.

More than one file reads like a diff view. Every document renders in one
continuous scroll, the findings pane runs through all of them grouped by file,
and next/prev crosses file boundaries. A file list appears beside the text —
only when there is more than one — showing which file you are in as you scroll
and jumping you to any of them.

The rules panel sits under the standing prose and lists every set that is
loaded, each collapsible, with a checkbox on the set itself and one per rule.
The set box is tri-state: on, off, or a dash when you have picked some rules out
of it. It carries the count, `27 rules`, or `11/27 rules` once you turn some
off.

The five sets in `rules/` are the only ones loaded, and all five arrive ticked.
`candidates/` is not offered here at all: those sets are work in progress, and a
visitor has no way to tell them apart from a rule that earned its place. Load
one with **Add from URL** or **Add a file** if you want to see what it says.

The layout is a fixed six-cell grid, one screen, nothing scrolling but the
insides of panels. The left column holds what stays put as you move between
check, rule sets and vocabulary: the masthead, the page's standing prose, and a
list. The right column holds what the page is for. A file list appears beside
the text only when more than one document is loaded, and the documents run end
to end in one scroller, so reading down carries you into the next file and the
findings follow. A theme control in the top right chooses light, dark or the
system setting, because a browser forced to dark for every site should not force
it here.

Two voices carry the design. Everything the linter says is monospace, everything
you wrote is serif.

Rules run in a **Web Worker**, which the page terminates if a run takes too long.
A regex from a rule set you fetched can backtrack forever, and a worker is the
only way to kill that without freezing the tab. The timeout starts only after
the worker reports ready, so a slow network is never mistaken for a runaway
rule.

---

