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
// What a failure generally means. Every line here has to be true of every
// instance of that failure, not just the common one: a wrong guess about the
// cause costs more than saying nothing. Anything rule-specific belongs in the
// rule's own `suggest`, not here.
export const FAILURE_HELP = {
  'no examples':
    'A rule with no tests.hit example cannot be checked at all. Add one sentence it should flag.',
  'false positive':
    'The pattern matched a tests.miss example, so it is broader than intended. '
    + 'A missing word boundary is the usual cause: "very" matches inside "every", "\\bvery\\b" does not.',
  'example does not match':
    'The pattern did not match a tests.hit example, so it is narrower than intended. '
    + 'In JSON every backslash is doubled, so a word boundary is written "\\b". '
    + 'Case is only ignored when flags include "i".',
  fragile:
    'The rule matched the plain sentence but not the same sentence carrying markup. '
    + 'Literal spaces are the usual cause: they fail across a soft-wrapped line or a '
    + 'non-breaking space, where "\\s+" holds.',
};

// A fudge failure is named after the variant that broke it, so anything that is
// not one of the conformance kinds is a markup failure.
export function failureHelp(kind) {
  return FAILURE_HELP[kind] || FAILURE_HELP[String(kind).split(':')[0]] || FAILURE_HELP.fragile;
}

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
    add('md:code-word', 'md', true, splice(example, tw.at, tw.word.length, '`' + tw.word + '`'));
    add('md:code-phrase', 'md', false, splice(example, s, e - s, '`' + span + '`'));
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


/**
 * Run both phases over a list of compiled rules: every tests.hit example must
 * match and every tests.miss must not, then each hit example is rewritten with
 * markup and must still fire.
 *
 * @param {object[]} rules   compiled rules (each with .find and .tests)
 * @param {{md: Function, html: Function}} extract
 */
export function testRules(rules, extract) {
  const out = { conform: { ok: 0, fail: 0 }, fudge: { ok: 0, fail: 0, lossy: 0 },
                failures: [], fragile: {} };
  for (const rule of rules) {
    const t = rule.tests || {};
    if (!(t.hit || []).length) {
      out.conform.fail++;
      out.failures.push({ rule: rule.id, kind: 'no examples', detail: 'every rule needs a tests.hit example' });
    }
    for (const ex of t.miss || []) {
      if (!rule.fires(ex)) out.conform.ok++;
      else { out.conform.fail++; out.failures.push({ rule: rule.id, kind: 'false positive', detail: ex }); }
    }
    for (const ex of t.hit || []) {
      if (!rule.fires(ex)) {
        out.conform.fail++;
        out.failures.push({ rule: rule.id, kind: 'example does not match', detail: ex });
        continue;
      }
      out.conform.ok++;
      // A metric rule (rhythm) counts nothing, so there is no span to preserve;
      // the variants still have to leave the whole passage judged the same way.
      const hits = rule.find(ex);
      const [s0, e0] = hits.length ? [hits[0].start, hits[0].end] : [0, Math.min(ex.length, 1)];
      for (const v of variants(ex, s0, e0)) {
        const { text } = extract[v.format](v.source, {});
        if (rule.fires(text)) { if (v.lossless) out.fudge.ok++; }
        else if (!v.lossless) out.fudge.lossy++;
        else {
          out.fudge.fail++;
          out.fragile[v.name] = (out.fragile[v.name] || 0) + 1;
          out.failures.push({ rule: rule.id, kind: `fragile: ${v.name}`, detail: v.source });
        }
      }
    }
  }
  return out;
}
