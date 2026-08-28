"""Turn a source file into prose plus a map back to source offsets.

Every extractor returns (text, runs). `text` is prose with markup removed;
`to_source(runs, offset)` converts an offset in it back to a byte offset in the
original file, so findings report accurate file:line:col.

Three rules drive the design, all of them learned from tests/run.mjs:

1. Inline markup is deleted, not blanked, so "in<b>ter</b>nal" stays one word.
2. Block boundaries emit a newline, but inline whitespace does not. HTML
   collapses whitespace, and markdown soft-wraps, so a newline in the *source*
   inside a paragraph is a space -- treating it as a line break puts a false
   sentence boundary at every wrap column.
3. Long unbroken lines are hard-wrapped. The sentence detectors rescan from
   every start position, so text with no terminator costs O(n^2).
"""
from __future__ import annotations

import html as _html
import re
from html.parser import HTMLParser

WRAP = 2000


class Mapper:
    """Builds extracted text while remembering where each piece came from."""

    def __init__(self, wrap: int = WRAP):
        self._chunks: list[str] = []
        self.runs: list[tuple[int, int, int, bool]] = []  # (out, src, len, fixed)
        self.len = 0
        self.col = 0
        self.wrap = max(80, wrap)

    def _raw(self, text: str, src: int, fixed: bool = False) -> None:
        if not text:
            return
        self._chunks.append(text)
        self.runs.append((self.len, src, len(text), fixed))
        self.len += len(text)

    def copy(self, text: str, src_start: int) -> None:
        """Text copied verbatim from the source; offsets map 1:1."""
        if not text:
            return
        i = 0
        while i < len(text):
            nl = text.find("\n", i)
            seg_end = len(text) if nl == -1 else nl + 1
            j = i
            while j < seg_end:
                room = max(1, self.wrap - self.col)
                if seg_end - j <= room:
                    self._raw(text[j:seg_end], src_start + j)
                    self.col += seg_end - j
                    j = seg_end
                else:
                    limit = min(j + room, seg_end)
                    br = -1
                    for k in range(limit - 1, j, -1):
                        if text[k] in " \t":
                            br = k
                            break
                    if br == -1:
                        br = limit
                    self._raw(text[j:br], src_start + j)
                    self._raw("\n", src_start + br, True)
                    self.col = 0
                    j = br
            if nl != -1:
                self.col = 0
            i = seg_end

    def sub(self, text: str, src_pos: int) -> None:
        """Text substituted for the source; every char maps to one offset."""
        if not text:
            return
        self._raw(text, src_pos, True)
        nl = text.rfind("\n")
        self.col = self.col + len(text) if nl == -1 else len(text) - nl - 1

    def brk(self, src_pos: int) -> None:
        """Emit a block separator, collapsing runs of them."""
        if self.len == 0 or (self._chunks and self._chunks[-1].endswith("\n")):
            return
        self.sub("\n", src_pos)

    def build(self) -> tuple[str, list]:
        return "".join(self._chunks), self.runs


def to_source(runs, off: int) -> int:
    if not runs:
        return 0
    lo, hi = 0, len(runs) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        o, s, n, fixed = runs[mid]
        if off < o:
            hi = mid - 1
        elif off >= o + n:
            lo = mid + 1
        else:
            return s if fixed else s + (off - o)
    o, s, n, fixed = runs[-1]
    return s + (0 if fixed else n)


# ------------------------------------------------------------------- HTML

SKIP_EL = {"script", "style", "pre", "code", "kbd", "samp", "var", "tt", "svg",
           "math", "textarea", "template", "noscript", "iframe", "object",
           "canvas", "head"}
BLOCK_EL = {"address", "article", "aside", "blockquote", "br", "caption", "dd",
            "details", "dialog", "div", "dl", "dt", "fieldset", "figcaption",
            "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6",
            "header", "hgroup", "hr", "legend", "li", "main", "menu", "nav",
            "ol", "p", "section", "summary", "table", "tbody", "td", "tfoot",
            "th", "thead", "tr", "ul", "option", "title", "body", "html"}

_WS_RUN = re.compile(r"\s*\n\s*|[ \t]{2,}")


def _copy_html_text(mapper: Mapper, text: str, base: int) -> None:
    last = 0
    for m in _WS_RUN.finditer(text):
        if m.start() > last:
            mapper.copy(text[last:m.start()], base + last)
        mapper.sub(" ", base + m.start())
        last = m.end()
    if last < len(text):
        mapper.copy(text[last:], base + last)


class _HtmlExtractor(HTMLParser):
    def __init__(self, src: str, mapper: Mapper):
        super().__init__(convert_charrefs=False)
        self.src = src
        self.mapper = mapper
        self.skip = 0
        self._line_starts = [0]
        for i, ch in enumerate(src):
            if ch == "\n":
                self._line_starts.append(i + 1)

    def _off(self) -> int:
        line, col = self.getpos()
        return self._line_starts[line - 1] + col

    def handle_starttag(self, tag, attrs):
        if tag in SKIP_EL:
            self.skip += 1
            self.mapper.brk(self._off())
        elif tag in BLOCK_EL:
            self.mapper.brk(self._off())

    def handle_startendtag(self, tag, attrs):
        if tag in BLOCK_EL:
            self.mapper.brk(self._off())

    def handle_endtag(self, tag):
        if tag in SKIP_EL:
            self.skip = max(0, self.skip - 1)
            self.mapper.brk(self._off())
        elif tag in BLOCK_EL:
            self.mapper.brk(self._off())

    def handle_data(self, data):
        if self.skip:
            return
        _copy_html_text(self.mapper, data, self._off())

    def handle_entityref(self, name):
        if self.skip:
            return
        self.mapper.sub(_html.unescape("&" + name + ";"), self._off())

    def handle_charref(self, name):
        if self.skip:
            return
        self.mapper.sub(_html.unescape("&#" + name + ";"), self._off())

    # A comment is inline: "<p>a <!-- x --> b</p>" is one sentence.
    def handle_comment(self, data):
        pass

    def handle_decl(self, decl):
        self.mapper.brk(self._off())

    def handle_pi(self, data):
        self.mapper.brk(self._off())


def extract_html(src: str, **opts) -> tuple[str, list]:
    mapper = Mapper(opts.get("wrap") or WRAP)
    parser = _HtmlExtractor(src, mapper)
    parser.feed(src)
    parser.close()
    return mapper.build()


# --------------------------------------------------------------- Markdown

FENCE = re.compile(r"^(\s{0,3})(`{3,}|~{3,})(.*)$")
SETEXT = re.compile(r"^\s{0,3}(?:=+|-{2,})\s*$")
ATX = re.compile(r"^(\s{0,3}#{1,6}\s+)")
QUOTE = re.compile(r"^(\s*(?:>\s?)+)")
BULLET = re.compile(r"^(\s*(?:[-*+]|\d{1,9}[.)])\s+)")
REFDEF = re.compile(r"^\s{0,3}\[[^\]]+\]:\s*\S")
HRULE = re.compile(r"^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$")
TABLE_DELIM = re.compile(r"^\s*\|?[\s:|-]*-[\s:|-]*\|[\s:|-]*$")
TABLE_ROW = re.compile(r"^\s*\|.*\|\s*$")

MD_INLINE = re.compile(
    r"(`+)[\s\S]*?\1"                                             # code span
    r"|!?\[((?:[^\[\]]|\[[^\]]*\])*)\]\((?:[^()\\]|\\.|\([^)]*\))*\)"  # inline link
    r"|!?\[((?:[^\[\]]|\[[^\]]*\])*)\]\[[^\]]*\]"                 # reference link
    r"|\[\^[^\]]+\]"                                              # footnote ref
    r"|<(?:https?|mailto|ftp):[^>\s]*>"                           # autolink
    r"|</?[a-zA-Z][^>]*>"                                         # raw HTML tag
    r"|(?:https?://|www\.)[^\s<>()\[\]\"']+"                      # bare URL
    r"|\*{1,3}|~~|={2,}"                                          # emphasis runs
    r"|(?<![A-Za-z0-9])_{1,3}|_{1,3}(?![A-Za-z0-9])"              # _emphasis_, not snake_case
)


def _md_inline(mapper: Mapper, line: str, base: int, depth: int = 0) -> None:
    last = 0
    pos = 0
    while pos <= len(line):
        m = MD_INLINE.search(line, pos)
        if not m:
            break
        if m.start() < last:
            pos = last
            continue
        text = m.group(2) if m.group(2) is not None else m.group(3)
        gap_end, after = m.start(), m.end()
        # A dropped token inside brackets would leave "()" behind.
        if not text:
            if (gap_end and after < len(line)
                    and ((line[gap_end - 1] == "(" and line[after] == ")")
                         or (line[gap_end - 1] == "[" and line[after] == "]"))):
                gap_end -= 1
                after += 1
        if gap_end > last:
            mapper.copy(line[last:gap_end], base + last)
        if text:
            at = m.group(0).find("[" + text)
            if at != -1:
                off = m.start() + at + 1
                if depth < 3:
                    _md_inline(mapper, text, base + off, depth + 1)
                else:
                    mapper.copy(text, base + off)
        last = after
        pos = max(after, m.start() + 1)
    if last < len(line):
        mapper.copy(line[last:], base + last)


def extract_markdown(src: str, **opts) -> tuple[str, list]:
    mapper = Mapper(opts.get("wrap") or WRAP)
    indent_code = opts.get("indent_code", True)
    skip_tables = opts.get("skip_tables", False)

    lines, pos = [], 0
    for raw in src.split("\n"):
        lines.append((raw.rstrip("\r"), pos))
        pos += len(raw) + 1

    i = 0
    if lines and re.match(r"^(---|\+\+\+)\s*$", lines[0][0]):
        close = lines[0][0].strip()
        for k in range(1, len(lines)):
            if lines[k][0].strip() == close:
                i = k + 1
                break

    fence = None
    recent_list = 0
    is_open = False
    prev_ends_block = True

    def close_block(off: int) -> None:
        nonlocal is_open
        if is_open:
            mapper.sub("\n", off)
            is_open = False

    while i < len(lines):
        line, off = lines[i]
        i += 1

        if fence is not None:
            f = FENCE.match(line)
            if f and f.group(2)[0] == fence[0] and len(f.group(2)) >= len(fence) and not f.group(3).strip():
                fence = None
            close_block(off)
            continue
        f = FENCE.match(line)
        if f:
            fence = f.group(2)
            close_block(off)
            continue
        if not line.strip():
            close_block(off)
            continue
        if indent_code and re.match(r"^(?: {4,}|\t)", line) and recent_list == 0:
            close_block(off)
            continue
        if REFDEF.match(line) or HRULE.match(line) or SETEXT.match(line) or TABLE_DELIM.match(line):
            close_block(off)
            continue
        if skip_tables and TABLE_ROW.match(line):
            close_block(off)
            continue

        recent_list = 3 if BULLET.match(line) else max(0, recent_list - 1)

        start = 0
        for rx in (QUOTE, ATX, BULLET):
            m = rx.match(line[start:])
            if m:
                start += len(m.group(1))
        q = QUOTE.match(line)
        after_quote = line[len(q.group(1)):] if q else line
        is_heading = bool(ATX.match(after_quote))
        is_table = bool(TABLE_ROW.match(line))
        starts_block = is_heading or is_table or bool(BULLET.match(after_quote))

        if is_open:
            mapper.sub("\n" if (starts_block or prev_ends_block) else " ", off)

        body = line[start:]
        if is_table:
            body = body.replace("|", " ")
        _md_inline(mapper, body, off + start)
        is_open = True
        prev_ends_block = is_heading or is_table or bool(re.search(r"(?: {2,}|\\)$", line))

    close_block(len(src))
    return mapper.build()


def extract_plain(src: str, **opts) -> tuple[str, list]:
    mapper = Mapper(opts.get("wrap") or WRAP)
    mapper.copy(src, 0)
    return mapper.build()


EXTRACTORS = {
    "html": extract_html, "htm": extract_html, "xhtml": extract_html,
    "md": extract_markdown, "markdown": extract_markdown,
    "mdx": extract_markdown, "mdown": extract_markdown,
}


def extractor_for(name: str):
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    return EXTRACTORS.get(ext, extract_plain)
