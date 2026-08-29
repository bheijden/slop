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

More than one file reads like a diff view: every document renders in one
continuous scroll, the findings pane runs through all of them grouped by file,
and next/prev crosses file boundaries. A file list on the left shows which file
you are in as you scroll and jumps you to any of them.

The input is one card: the text, the buttons that fill it, and the **rules**
control that decides what runs over it. The rules button opens a panel of the
loaded sets, each collapsible, with per-rule finding counts and a URL box for
adding another. It carries the state: `38 rules`, or `11/38 rules` once you
turn some off. Load a directory and the text area gives way to a summary, so the
card and its controls stay put.

Three columns (files, document, findings) separated by dividers you can drag
to resize or step left and right to collapse. A theme control in the bar chooses
light, dark or the system setting, because a browser forced to dark for every
site should not force it here. The page grows with the window, with a side
margin that widens to a cap.

Two voices carry the design: everything the linter says is monospace, everything
you wrote is serif.

Rules run in a **Web Worker**, which the page terminates if a run takes too long.
A regex from a rule set you fetched can backtrack forever, and a worker is the
only way to kill that without freezing the tab. The timeout starts only after
the worker reports ready, so a slow network is never mistaken for a runaway
rule.

---

