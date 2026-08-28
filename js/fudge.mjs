// Markup fudging: take a rule's plain-text example, inject the kind of markup a
// real document carries, and check the rule still fires.
//
// This is how you refine a rule. Write an example, run `slop test-rules`,
// and every variant that turns a HIT into a MISS is a place where extraction or
// the pattern itself is too brittle for real files.
//
// Variants are marked lossless or lossy. Lossless markup only changes how the
// text is *presented* -- extraction must recover the original words, so a MISS
// is a bug. Lossy markup genuinely removes words (inline code), so a MISS there
// is expected and only reported for information.

const WORD = /[A-Za-z][A-Za-z'’-]{2,}/g;

// Pick a stable target word inside [s,e): the longest, leftmost on ties.
function targetWord(text, s, e) {
  const span = text.slice(s, e);
  let best = null;
  for (const m of span.matchAll(WORD)) {
    // Only fudge words that are ordinary prose tokens. Bolding half a URL
    // ("utm_**source**=") is not something a document does, and a rule that
    // misses it is not fragile.
    const ts = span.lastIndexOf(' ', m.index) + 1;
    const te = span.indexOf(' ', m.index) === -1 ? span.length : span.indexOf(' ', m.index);
    if (!/^[A-Za-z'’-]+[.,;:!?)]?$/.test(span.slice(ts, te))) continue;
    if (!best || m[0].length > best[0].length) best = m;
  }
  return best ? { word: best[0], at: s + best.index } : null;
}

function spaceIn(text, s, e) {
  const i = text.indexOf(' ', s + 1);
  return i !== -1 && i < e - 1 ? i : -1;
}

const splice = (t, at, len, ins) => t.slice(0, at) + ins + t.slice(at + len);

/**
 * Build markup variants of `example` that leave the span [s,e) semantically intact.
 * @returns {{name:string, format:'md'|'html', lossless:boolean, source:string}[]}
 */
export function variants(example, s, e) {
  const out = [];
  const add = (name, format, lossless, source) => out.push({ name, format, lossless, source });
  const tw = targetWord(example, s, e);
  const sp = spaceIn(example, s, e);
  const span = example.slice(s, e);

  // ---- markdown ----
  add('md:plain', 'md', true, example);
  add('md:bold-span', 'md', true, splice(example, s, e - s, `**${span}**`));
  add('md:italic-span', 'md', true, splice(example, s, e - s, `_${span}_`));
  if (tw) {
    add('md:bold-word', 'md', true, splice(example, tw.at, tw.word.length, `**${tw.word}**`));
    add('md:italic-word', 'md', true, splice(example, tw.at, tw.word.length, `_${tw.word}_`));
    const cut = Math.max(1, Math.floor(tw.word.length / 2));
    add('md:bold-inside-word', 'md', true,
        splice(example, tw.at, tw.word.length, tw.word.slice(0, cut) + '**' + tw.word.slice(cut) + '**'));
    add('md:link-word', 'md', true,
        splice(example, tw.at, tw.word.length, `[${tw.word}](https://example.com/a_b)`));
    add('md:footnote-after-word', 'md', true, splice(example, tw.at + tw.word.length, 0, '[^1]'));
    add('md:code-word', 'md', false, splice(example, tw.at, tw.word.length, '`' + tw.word + '`'));
  }
  if (sp !== -1) {
    add('md:soft-wrap', 'md', true, splice(example, sp, 1, '\n'));
    add('md:double-space', 'md', true, splice(example, sp, 1, '  '));
  }
  add('md:blockquote', 'md', true, '> ' + example.replace(/\n/g, '\n> '));
  add('md:list-item', 'md', true, '- ' + example.replace(/\n/g, '\n  '));

  // ---- html ----
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const p = (inner) => `<p>${inner}</p>`;
  add('html:plain', 'html', true, p(esc(example)));
  add('html:bold-span', 'html', true, p(esc(example.slice(0, s)) + '<b>' + esc(span) + '</b>' + esc(example.slice(e))));
  add('html:em-span', 'html', true, p(esc(example.slice(0, s)) + '<em>' + esc(span) + '</em>' + esc(example.slice(e))));
  if (tw) {
    const pre = esc(example.slice(0, tw.at));
    const post = esc(example.slice(tw.at + tw.word.length));
    add('html:em-word', 'html', true, p(pre + '<em>' + tw.word + '</em>' + post));
    add('html:nested-em-strong', 'html', true, p(pre + '<em><strong>' + tw.word + '</strong></em>' + post));
    const cut = Math.max(1, Math.floor(tw.word.length / 2));
    add('html:tag-inside-word', 'html', true,
        p(pre + tw.word.slice(0, cut) + '<b>' + tw.word.slice(cut) + '</b>' + post));
    add('html:link-word', 'html', true, p(pre + '<a href="/x?a=1&amp;b=2">' + tw.word + '</a>' + post));
    add('html:comment-before-word', 'html', true, p(pre + '<!-- note -->' + tw.word + post));
  }
  add('html:span-per-word', 'html', true,
      p(esc(example).split(' ').map((w) => `<span>${w}</span>`).join(' ')));
  add('html:entities', 'html', true,
      p(esc(example).replace(/'/g, '&#39;').replace(/’/g, '&rsquo;').replace(/—/g, '&mdash;')));
  if (sp !== -1) {
    add('html:nbsp', 'html', true, p(esc(splice(example, sp, 1, ' ')).replace(/ /g, '&nbsp;')));
    add('html:source-newline', 'html', true, p(esc(splice(example, sp, 1, '\n      '))));
  }
  add('html:nested-blocks', 'html', true, `<div><section><blockquote>${p(esc(example))}</blockquote></section></div>`);
  return out;
}

export const LOSSLESS_ONLY = (v) => v.lossless;
