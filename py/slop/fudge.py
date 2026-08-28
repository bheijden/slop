"""Markup fudging - see js/fudge.mjs for the rationale.

Take a rule's plain-text example, inject the markup a real document carries,
and check the rule still fires. Lossless variants must still hit; lossy ones
(inline code, which removes words) may miss.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

_WORD = re.compile(r"[A-Za-z][A-Za-z'’-]{2,}")
_PROSE_TOKEN = re.compile(r"^[A-Za-z'’-]+[.,;:!?)]?$")


@dataclass
class Variant:
    name: str
    format: str  # "md" or "html"
    lossless: bool
    source: str


def _target_word(text: str, s: int, e: int):
    span = text[s:e]
    best = None
    for m in _WORD.finditer(span):
        # Only fudge ordinary prose tokens. Bolding half a URL is not something
        # a document does, so a rule that misses it is not fragile.
        ts = span.rfind(" ", 0, m.start()) + 1
        te = span.find(" ", m.start())
        te = len(span) if te == -1 else te
        if not _PROSE_TOKEN.match(span[ts:te]):
            continue
        if best is None or len(m.group(0)) > len(best.group(0)):
            best = m
    return (best.group(0), s + best.start()) if best else None


def _splice(t: str, at: int, length: int, ins: str) -> str:
    return t[:at] + ins + t[at + length:]


def variants(example: str, s: int, e: int) -> list[Variant]:
    out: list[Variant] = []
    def add(name, fmt, lossless, source):
        out.append(Variant(name, fmt, lossless, source))

    tw = _target_word(example, s, e)
    sp = example.find(" ", s + 1)
    sp = sp if sp != -1 and sp < e - 1 else -1
    span = example[s:e]

    add("md:plain", "md", True, example)
    add("md:bold-span", "md", True, _splice(example, s, e - s, f"**{span}**"))
    add("md:italic-span", "md", True, _splice(example, s, e - s, f"_{span}_"))
    if tw:
        w, at = tw
        add("md:bold-word", "md", True, _splice(example, at, len(w), f"**{w}**"))
        add("md:italic-word", "md", True, _splice(example, at, len(w), f"_{w}_"))
        cut = max(1, len(w) // 2)
        add("md:bold-inside-word", "md", True, _splice(example, at, len(w), w[:cut] + "**" + w[cut:] + "**"))
        add("md:link-word", "md", True, _splice(example, at, len(w), f"[{w}](https://example.com/a_b)"))
        add("md:footnote-after-word", "md", True, _splice(example, at + len(w), 0, "[^1]"))
        add("md:code-word", "md", False, _splice(example, at, len(w), f"`{w}`"))
    if sp != -1:
        add("md:soft-wrap", "md", True, _splice(example, sp, 1, "\n"))
        add("md:double-space", "md", True, _splice(example, sp, 1, "  "))
    add("md:blockquote", "md", True, "> " + example.replace("\n", "\n> "))
    add("md:list-item", "md", True, "- " + example.replace("\n", "\n  "))

    def esc(t):
        return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    def p(inner):
        return f"<p>{inner}</p>"

    add("html:plain", "html", True, p(esc(example)))
    add("html:bold-span", "html", True, p(esc(example[:s]) + "<b>" + esc(span) + "</b>" + esc(example[e:])))
    add("html:em-span", "html", True, p(esc(example[:s]) + "<em>" + esc(span) + "</em>" + esc(example[e:])))
    if tw:
        w, at = tw
        pre, post = esc(example[:at]), esc(example[at + len(w):])
        add("html:em-word", "html", True, p(pre + "<em>" + w + "</em>" + post))
        add("html:nested-em-strong", "html", True, p(pre + "<em><strong>" + w + "</strong></em>" + post))
        cut = max(1, len(w) // 2)
        add("html:tag-inside-word", "html", True, p(pre + w[:cut] + "<b>" + w[cut:] + "</b>" + post))
        add("html:link-word", "html", True, p(pre + '<a href="/x?a=1&amp;b=2">' + w + "</a>" + post))
        add("html:comment-before-word", "html", True, p(pre + "<!-- note -->" + w + post))
    add("html:span-per-word", "html", True,
        p(" ".join(f"<span>{w}</span>" for w in esc(example).split(" "))))
    add("html:entities", "html", True,
        p(esc(example).replace("'", "&#39;").replace("’", "&rsquo;").replace("—", "&mdash;")))
    if sp != -1:
        add("html:nbsp", "html", True, p(esc(_splice(example, sp, 1, " ")).replace(" ", "&nbsp;")))
        add("html:source-newline", "html", True, p(esc(_splice(example, sp, 1, "\n      "))))
    add("html:nested-blocks", "html", True,
        f"<div><section><blockquote>{p(esc(example))}</blockquote></section></div>")
    return out
