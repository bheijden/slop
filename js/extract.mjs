// Text extraction for cliche-lint.
//
// Both extractors return { text, runs }: `text` is prose with markup removed,
// `runs` maps every offset in it back to a byte offset in the original file so
// findings can be reported as file:line:col.
//
// Two rules drive the design:
//  1. Inline markup is *deleted*, not blanked, so "in<b>ter</b>nal" stays one
//     word instead of becoming three.
//  2. Block boundaries *must* emit a newline. The upstream sentence regexes
//     (/[^.!?\n]+[.!?]/ and friends) go quadratic on a long run of text with no
//     terminator: 8000 words on one line takes ~4.3s vs ~30ms when broken into
//     lines. Flattening HTML without newlines is the easy way to hit that.

const WRAP = 2000; // safety net: hard-wrap any line longer than this

export class Mapper {
  constructor(wrap = WRAP) {
    this.chunks = [];
    this.runs = [];
    this.len = 0;
    this.col = 0;
    this.wrap = Math.max(80, wrap);
  }

  _raw(text, srcStart, fixed) {
    if (!text) return;
    this.chunks.push(text);
    this.runs.push({ o: this.len, s: srcStart, n: text.length, fixed: !!fixed });
    this.len += text.length;
  }

  // Text copied verbatim from the source; offsets map 1:1.
  copy(text, srcStart) {
    if (!text) return;
    let i = 0;
    while (i < text.length) {
      const nl = text.indexOf('\n', i);
      const segEnd = nl === -1 ? text.length : nl + 1;
      let j = i;
      while (j < segEnd) {
        const room = Math.max(1, this.wrap - this.col);
        if (segEnd - j <= room) {
          this._raw(text.slice(j, segEnd), srcStart + j);
          this.col += segEnd - j;
          j = segEnd;
        } else {
          const limit = Math.min(j + room, segEnd);
          let br = -1;
          for (let k = limit - 1; k > j; k--) {
            if (text[k] === ' ' || text[k] === '\t') { br = k; break; }
          }
          if (br === -1) br = limit;
          this._raw(text.slice(j, br), srcStart + j);
          this._raw('\n', srcStart + br, true);
          this.col = 0;
          j = br;
        }
      }
      if (nl !== -1) this.col = 0;
      i = segEnd;
    }
  }

  // Text substituted for the source (decoded entity, synthetic newline);
  // every character maps to the same source offset.
  sub(text, srcPos) {
    if (!text) return;
    this._raw(text, srcPos, true);
    const nl = text.lastIndexOf('\n');
    if (nl === -1) this.col += text.length;
    else this.col = text.length - nl - 1;
  }

  // Emit a block separator, collapsing runs of them.
  brk(srcPos) {
    const t = this.chunks[this.chunks.length - 1];
    if (this.len === 0 || (t && t.endsWith('\n'))) return;
    this.sub('\n', srcPos);
  }

  build() {
    return { text: this.chunks.join(''), runs: this.runs };
  }
}

// Map an offset in the extracted text back to a source offset.
export function toSource(runs, off) {
  if (!runs.length) return 0;
  let lo = 0;
  let hi = runs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = runs[mid];
    if (off < r.o) hi = mid - 1;
    else if (off >= r.o + r.n) lo = mid + 1;
    else return r.fixed ? r.s : r.s + (off - r.o);
  }
  const last = runs[runs.length - 1];
  return last.s + (last.fixed ? 0 : last.n);
}

// ---------------------------------------------------------------- entities

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', rsquo: '’',
  lsquo: '‘', ldquo: '“', rdquo: '”', copy: '©',
  reg: '®', trade: '™', deg: '°', hyphen: '‐',
  laquo: '«', raquo: '»', middot: '·', bull: '•',
  times: '×', minus: '−', eacute: 'é', egrave: 'è',
  ouml: 'ö', uuml: 'ü', auml: 'ä', szlig: 'ß',
  euro: '€', pound: '£', shy: '', zwnj: '', zwj: '', ensp: ' ',
  emsp: ' ', thinsp: ' ', lsaquo: '‹', rsaquo: '›', dagger: '†'
};
const ENTITY = /&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});/g;

function decodeInto(mapper, text, base) {
  ENTITY.lastIndex = 0;
  let last = 0;
  let m;
  while ((m = ENTITY.exec(text))) {
    if (m.index > last) mapper.copy(text.slice(last, m.index), base + last);
    const body = m[1];
    let out;
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      out = Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m[0];
    } else {
      out = Object.prototype.hasOwnProperty.call(NAMED, body) ? NAMED[body] : m[0];
    }
    mapper.sub(out, base + m.index);
    last = m.index + m[0].length;
  }
  if (last < text.length) mapper.copy(text.slice(last), base + last);
}

// HTML collapses whitespace runs in normal flow, so a newline inside a <p> is
// a space, not a sentence boundary. Collapsing before matching keeps the
// sentence-based detectors from seeing a false break at the source wrap point.
const WS_RUN = /\s*\n\s*|[ \t]{2,}/g;

function copyHtmlText(mapper, text, base) {
  WS_RUN.lastIndex = 0;
  let last = 0;
  let m;
  while ((m = WS_RUN.exec(text))) {
    if (m.index > last) decodeInto(mapper, text.slice(last, m.index), base + last);
    mapper.sub(' ', base + m.index);
    last = m.index + m[0].length;
  }
  if (last < text.length) decodeInto(mapper, text.slice(last), base + last);
}

// -------------------------------------------------------------------- HTML

const SKIP_EL = /^(?:script|style|pre|code|kbd|samp|var|tt|svg|math|textarea|template|noscript|iframe|object|canvas|head)$/i;
const BLOCK_EL = /^(?:address|article|aside|blockquote|br|caption|dd|details|dialog|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hgroup|hr|legend|li|main|menu|nav|ol|p|section|summary|table|tbody|td|tfoot|th|thead|tr|ul|option|title|body|html)$/i;
const HTML_TOKEN = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\?[\s\S]*?\?>|<\/?([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>/g;

export function extractHtml(src, opts = {}) {
  const mapper = new Mapper(opts.wrap);
  HTML_TOKEN.lastIndex = 0;
  let last = 0;
  let m;
  while ((m = HTML_TOKEN.exec(src))) {
    if (m.index > last) copyHtmlText(mapper, src.slice(last, m.index), last);
    last = m.index + m[0].length;
    const name = m[1];
    if (!name) {
      // A comment is inline: "<p>a <!-- x --> b</p>" is one sentence. Doctype
      // and processing instructions sit between blocks.
      if (!m[0].startsWith('<!--')) mapper.brk(m.index);
      continue;
    }
    const closing = m[0][1] === '/';
    const selfClosing = /\/\s*$/.test(m[2] || '');
    if (!closing && !selfClosing && SKIP_EL.test(name)) {
      // Jump past the matching close tag; these elements do not nest in practice.
      const close = new RegExp('</\\s*' + name.replace(/[^\w:-]/g, '') + '\\s*>', 'i');
      close.lastIndex = 0;
      const rest = src.slice(last);
      const hit = close.exec(rest);
      const end = hit ? last + hit.index + hit[0].length : src.length;
      mapper.brk(m.index);
      HTML_TOKEN.lastIndex = end;
      last = end;
      continue;
    }
    if (BLOCK_EL.test(name)) mapper.brk(m.index);
  }
  if (last < src.length) copyHtmlText(mapper, src.slice(last), last);
  return mapper.build();
}

// ---------------------------------------------------------------- Markdown

const FENCE = /^(\s{0,3})(`{3,}|~{3,})(.*)$/;
const SETEXT = /^\s{0,3}(?:=+|-{2,})\s*$/;
const ATX = /^(\s{0,3}#{1,6}\s+)/;
const QUOTE = /^(\s*(?:>\s?)+)/;
const BULLET = /^(\s*(?:[-*+]|\d{1,9}[.)])\s+)/;
const REFDEF = /^\s{0,3}\[[^\]]+\]:\s*\S/;
const HRULE = /^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;
const TABLE_DELIM = /^\s*\|?[\s:|-]*-[\s:|-]*\|[\s:|-]*$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;

// Inline markup: code spans, links/images, raw HTML, autolinks, bare URLs,
// and emphasis runs. Link/image text is kept and re-scanned; everything else
// in the token is dropped.
const MD_INLINE = new RegExp([
  '(`+)[\\s\\S]*?\\1',                                        // code span
  '!?\\[((?:[^\\[\\]]|\\[[^\\]]*\\])*)\\]\\((?:[^()\\\\]|\\\\.|\\([^)]*\\))*\\)', // inline link
  '!?\\[((?:[^\\[\\]]|\\[[^\\]]*\\])*)\\]\\[[^\\]]*\\]',      // reference link
  '\\[\\^[^\\]]+\\]',                                         // footnote reference
  '<(?:https?|mailto|ftp):[^>\\s]*>',                          // autolink
  '</?[a-zA-Z][^>]*>',                                         // raw HTML tag
  '(?:https?://|www\\.)[^\\s<>()\\[\\]"\']+',                  // bare URL
  '\\*{1,3}|~~|={2,}',                                         // emphasis runs
  // Underscore emphasis, but never inside a word: _italic_ goes, snake_case stays.
  '(?<![A-Za-z0-9])_{1,3}|_{1,3}(?![A-Za-z0-9])'
].join('|'), 'g');

function mdInline(mapper, line, base, depth) {
  const re = new RegExp(MD_INLINE.source, 'g');
  let last = 0;
  let m;
  while ((m = re.exec(line))) {
    if (m.index < last) { re.lastIndex = last; continue; }
    const tok = m[0];
    const text = m[2] !== undefined ? m[2] : m[3];
    let gapEnd = m.index;
    let after = m.index + tok.length;
    // A dropped token inside brackets would leave "()" behind -- as in
    // "AX200 (`iwlwifi`)". Take the brackets with it.
    if (!text) {
      const open = line[gapEnd - 1];
      const close = line[after];
      if ((open === '(' && close === ')') || (open === '[' && close === ']')) { gapEnd -= 1; after += 1; }
    }
    if (gapEnd > last) mapper.copy(line.slice(last, gapEnd), base + last);
    if (text) {
      const at = tok.indexOf('[' + text);
      if (at !== -1) {
        const off = m.index + at + 1;
        if (depth < 3) mdInline(mapper, text, base + off, depth + 1);
        else mapper.copy(text, base + off);
      }
    }
    last = after;
    re.lastIndex = Math.max(after, m.index + 1);
  }
  if (last < line.length) mapper.copy(line.slice(last), base + last);
}

export function extractMarkdown(src, opts = {}) {
  const mapper = new Mapper(opts.wrap);
  const indentCode = opts.indentCode !== false;
  const skipTables = !!opts.skipTables;
  const lines = [];
  {
    let pos = 0;
    for (const raw of src.split('\n')) {
      lines.push({ text: raw.replace(/\r$/, ''), off: pos });
      pos += raw.length + 1;
    }
  }

  let i = 0;
  // YAML / TOML front matter
  if (lines.length && /^(---|\+\+\+)\s*$/.test(lines[0].text)) {
    const close = lines[0].text.trim();
    for (let k = 1; k < lines.length; k++) {
      if (lines[k].text.trim() === close) { i = k + 1; break; }
    }
  }

  let fence = null;
  let recentList = 0;
  let open = false;       // a prose line is emitted and awaiting its separator
  let prevEndsBlock = true;
  const close = (off) => { if (open) { mapper.sub('\n', off); open = false; } };

  for (; i < lines.length; i++) {
    const { text: line, off } = lines[i];

    if (fence) {
      const f = line.match(FENCE);
      if (f && f[2][0] === fence[0] && f[2].length >= fence.length && !f[3].trim()) fence = null;
      close(off);
      continue;
    }
    const f = line.match(FENCE);
    if (f) { fence = f[2]; close(off); continue; }

    if (!line.trim()) { close(off); continue; }

    // Indented code: 4+ spaces, not a list continuation.
    if (indentCode && /^(?: {4,}|\t)/.test(line) && recentList === 0) { close(off); continue; }

    if (REFDEF.test(line) || HRULE.test(line) || SETEXT.test(line) || TABLE_DELIM.test(line)) {
      close(off);
      continue;
    }
    if (skipTables && TABLE_ROW.test(line)) { close(off); continue; }

    recentList = BULLET.test(line) ? 3 : Math.max(0, recentList - 1);

    let start = 0;
    for (const re of [QUOTE, ATX, BULLET]) {
      const m = line.slice(start).match(re);
      if (m) start += m[1].length;
    }
    const afterQuote = line.slice((line.match(QUOTE) || [, ''])[1].length);
    const isHeading = ATX.test(afterQuote);
    const isTable = TABLE_ROW.test(line);
    const startsBlock = isHeading || isTable || BULLET.test(afterQuote);

    // Markdown soft-wraps: consecutive prose lines are one paragraph and join
    // with a space. Emitting a newline instead would put a false sentence
    // boundary at every hard-wrap column, which breaks the sentence detectors.
    if (open) mapper.sub(startsBlock || prevEndsBlock ? '\n' : ' ', off);

    let body = line.slice(start);
    // Table cells become spaces so a row reads as one line of prose.
    if (isTable) body = body.replace(/\|/g, ' ');
    mdInline(mapper, body, off + start, 0);
    open = true;
    prevEndsBlock = isHeading || isTable || /(?: {2,}|\\)$/.test(line);
  }
  close(src.length);
  return mapper.build();
}

export function extractPlain(src, opts = {}) {
  const mapper = new Mapper(opts.wrap);
  mapper.copy(src, 0);
  return mapper.build();
}

export function extractorFor(file) {
  const ext = (file.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
  if (ext === 'html' || ext === 'htm' || ext === 'xhtml') return extractHtml;
  if (ext === 'md' || ext === 'markdown' || ext === 'mdx' || ext === 'mdown') return extractMarkdown;
  return extractPlain;
}
