# The web page

<https://bheijden.github.io/slop/>



`web/index.html` is a static page. Paste text, or drop a file, several files, a
folder or a `.zip` anywhere on it. Non-text files are counted and skipped rather
than failing.

Findings are highlighted in the document, and hovering one shows the rule and
its fix. Read them over the extracted prose or over your original source. The
findings list sits beside the document; **copy JSON** puts the whole result on
the clipboard in exactly the shape `--format json` writes, so it pastes straight
into an issue, a review or an agent's context.

More than one file reads like a diff view. Every document renders in one
continuous scroll, the findings pane runs through all of them grouped by file,
and next/prev crosses file boundaries. A file list on the left shows which file
you are in as you scroll and jumps you to any of them.

The input is one card, holding the text, the buttons that fill it, and the **rules**
control that decides what runs over it. The rules button opens a panel of every set the repo carries, each collapsible,
with a checkbox on the set itself and one per rule. The set box is tri-state: on,
off, or a dash when you have picked some rules out of it. It carries the count,
`27 rules`, or `11/27 rules` once you turn some off.

What ships in `rules/` arrives ticked. Everything in `candidates/`, style
profiles included, arrives unticked, so you can see what a set would say before
letting it say it. There is no separate section for style profiles, because they are the
same kind of artifact and get the same control.

Three columns (files, document, findings) separated by dividers you can drag
to resize or step left and right to collapse. A theme control in the bar chooses
light, dark or the system setting, because a browser forced to dark for every
site should not force it here. The page grows with the window, with a side
margin that widens to a cap.

Two voices carry the design. Everything the linter says is monospace, everything
you wrote is serif.

Rules run in a **Web Worker**, which the page terminates if a run takes too long.
A regex from a rule set you fetched can backtrack forever, and a worker is the
only way to kill that without freezing the tab. The timeout starts only after
the worker reports ready, so a slow network is never mistaken for a runaway
rule.

---

