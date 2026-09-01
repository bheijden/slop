// The rule engine, in two halves.
//
// A MATCHER finds occurrences and knows nothing about whether they matter.
// A VERDICT (`notable`) decides whether a count is worth reporting, and at what
// rate. Splitting them is what lets one pattern be judged several ways, and what
// lets every rule report both its occurrences and its rate: those used to be a
// choice between a span kind and the old `density` kind.
//
// Behaviour is deliberately identical to the upstream LLM cliche highlighter,
// which is what tests/conformance lets us prove. Do not "improve" a detector
// here without regenerating the rule tests.

export const KINDS = ['regex', 'chain', 'echo', 'question-chain', 'anaphora', 'rhythm', 'frame'];

const CHAIN_BODY = String.raw`[^,.;:!?\n–—…]*`;
const CHAIN_SEP = String.raw`(?:\s*,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+|\s*[;&–—]\s*(?:and\s+|or\s+)?|\s+-{1,2}\s+)`;
const CHAIN_SPLIT = new RegExp(CHAIN_SEP, 'i');

const ANAPHORA_SKIP = /^(?:i|it|the|a|an|this|that|we|you|they|he|she|there|but|and|so|in|as|if|my|his|her|their|its|these|those|for|at|on|of|to|is|was)$/i;

function reOf(rule) {
  const flags = rule.flags && rule.flags.includes('i') ? 'gi' : 'g';
  try {
    return new RegExp(rule.pattern, flags);
  } catch (err) {
    throw new Error(`rule "${rule.id}": bad pattern: ${err.message}`);
  }
}

function regexFinder(rule) {
  const re = reOf(rule);
  return (text) => {
    const found = [];
    for (const m of text.matchAll(re)) found.push({ start: m.index, end: m.index + m[0].length });
    return found;
  };
}

function chainFinder(rule) {
  const re = reOf(rule);
  const headTest = new RegExp(rule.headTest, 'i');
  const label = rule.itemLabel || 'item';
  return (text) => {
    const found = [];
    for (const m of text.matchAll(re)) {
      let end = m.index + m[0].length;
      while (end > m.index && /\s/.test(text[end - 1])) end -= 1;
      const count = m[0].split(CHAIN_SPLIT).filter((p) => headTest.test(p.trim())).length;
      found.push({ start: m.index, end, count, badge: String(count),
                   badgeTitle: `${count} ${label}${count === 1 ? '' : 's'}` });
    }
    return found;
  };
}

function echoFinder(rule) {
  // `anchored` and `minShare` default off, so the original behaviour is
  // untouched. They exist because the loose form fires on formal prose, where
  // consecutive sentences share a phrase without sharing a shape. The tell that
  // sources actually describe is repetition at the sentence *opening*, across
  // three or more units: "Ensures... Provides... Enables...".
  const { minGram = 4, minRun = 2, anchored = false, minShare = 0, minFuncWords = 0 } = rule.params || {};
  const SENT = /[^.!?\n]+[.!?]?/g;
  const grams = (s, n) => {
    const w = s.toLowerCase().match(/[a-z0-9'’-]+/g) || [];
    const out = new Set();
    for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '));
    return out;
  };
  return (text) => {
    const sents = [];
    for (const m of text.matchAll(SENT)) {
      if ((m[0].match(/\S+/g) || []).length >= 4) {
        sents.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
      }
    }
    const found = [];
    let i = 0;
    while (i < sents.length) {
      let j = i;
      let shared = null;
      while (j + 1 < sents.length) {
        if (sents[j + 1].start - sents[j].end > 3) break;
        const words = (t) => t.toLowerCase().match(/[a-z0-9'’-]+/g) || [];
        const a = grams(sents[j].text, minGram);
        const b = grams(sents[j + 1].text, minGram);
        let common = [...a].filter((g) => b.has(g));
        if (anchored) {
          // Aligned, not merely present. An echo repeats a frame at the same
          // place in both sentences: "…is an object in the system." Topic words
          // recur anywhere, which is what the loose form kept catching.
          const head = (t) => words(t).slice(0, minGram).join(' ');
          const tail = (t) => words(t).slice(-minGram).join(' ');
          const ok = [];
          if (anchored !== 'tail' && head(sents[j].text) && head(sents[j].text) === head(sents[j + 1].text))
            ok.push(head(sents[j].text));
          if (anchored !== 'head' && tail(sents[j].text) && tail(sents[j].text) === tail(sents[j + 1].text))
            ok.push(tail(sents[j].text));
          common = ok;
        }
        if (minFuncWords > 0 && common.length) {
          // A shared span made of content words is a shared subject, not a
          // shared shape. "the person who died" is what the document is about;
          // "is an object in the system" is a frame with the nouns swapped.
          common = common.filter((g) =>
            g.split(' ').filter((w) => FUNC_WORDS.has(w)).length >= minFuncWords);
        }
        if (minShare > 0 && common.length) {
          const shortest = Math.min(words(sents[j].text).length, words(sents[j + 1].text).length) || 1;
          common = common.filter((g) => g.split(' ').length / shortest >= minShare);
        }
        if (!common.length) break;
        shared = common.sort((x, y) => y.length - x.length)[0];
        j += 1;
      }
      const run = j - i + 1;
      if (run >= minRun && shared) {
        let end = sents[j].end;
        while (end > sents[i].start && /\s/.test(text[end - 1])) end -= 1;
        found.push({ start: sents[i].start, end, count: run, badge: String(run),
                     badgeTitle: `${run} sentences echoing “${shared}”` });
        i = j + 1;
      } else i += 1;
    }
    return found;
  };
}

function questionChainFinder(rule) {
  const { minRun = 2 } = rule.params || {};
  const chain = /[^.!?\n]+\?(?:\s+[^.!?\n]+\?)+/g;
  return (text) => {
    const found = [];
    for (const m of text.matchAll(chain)) {
      const count = (m[0].match(/\?/g) || []).length;
      if (count < minRun) continue;
      let start = m.index;
      while (start < m.index + m[0].length && /\s/.test(text[start])) start += 1;
      found.push({ start, end: m.index + m[0].length, count, badge: String(count),
                   badgeTitle: `${count} questions in a row` });
    }
    return found;
  };
}

function anaphoraFinder(rule) {
  const { minRun = 3 } = rule.params || {};
  const SENT = /[^.!?\n]+[.!?]/g;
  return (text) => {
    const sents = [];
    for (const m of text.matchAll(SENT)) {
      const w = m[0].match(/[A-Za-z'’-]+/);
      if (w) sents.push({ start: m.index + m[0].indexOf(w[0]), end: m.index + m[0].length, head: w[0].toLowerCase() });
    }
    const found = [];
    let i = 0;
    while (i < sents.length) {
      let j = i;
      while (j + 1 < sents.length && sents[j + 1].head === sents[i].head
             && sents[j + 1].start - sents[j].end < 4) j += 1;
      const run = j - i + 1;
      if (run >= minRun && !ANAPHORA_SKIP.test(sents[i].head)) {
        found.push({ start: sents[i].start, end: sents[j].end, count: run, badge: String(run),
                     badgeTitle: `${run} sentences opening “${sents[i].head}”` });
        i = j + 1;
      } else i += 1;
    }
    return found;
  };
}

// Document-level rates rather than spans. Five independent sources landed on
// this shape: sloptells' slopIndex, slopster's Vale `occurrence`, the antislop
// sampler's slop_index.py, the arXiv taxonomy's Density and Verbosity codes,
// and The Economist's 2026 study, whose findings are almost all rates.
//
// `min` fires on pile-up, `max` on scarcity, and scarcity is a real tell:
// the Economist found LLM prose uses *fewer* commas, semicolons and
// parentheses than human writing, not more.
const DENSITY_WORD = /[A-Za-z0-9][A-Za-z0-9'\u2019-]*/g;

// Whether a document is prose is a question about its vocabulary, not about how
// long its sentences are. Using mean sentence length as the proxy was a bug: it
// gated out exactly the documents a sentence-length band exists to catch, so
// such a rule could never fire in either direction. Closed-class words separate
// the two cleanly. Measured over this project's corpus: config dumps, CSV and
// diffs land at 0 to 0.4 percent, pasted source at 8.6, and real prose at 16.8
// to 43.8.
function functionWordRatio(text) {
  const toks = text.match(DENSITY_WORD) || [];
  if (!toks.length) return 0;
  let n = 0;
  for (const t of toks) if (FUNC_WORDS.has(t.toLowerCase())) n += 1;
  return n / toks.length;
}

function densityMatcher(rule) {
  // Just the matches. Whether there are too many, or too few, is `notable`.
  const re = reOf(rule);
  return (text) => [...text.matchAll(re)].map((m) => ({ start: m.index, end: m.index + m[0].length }));
}

// Sentence-length variation, as a coefficient of variation: standard deviation
// over mean. Low means every sentence is the same length, what sloptells calls
// "sentences that march in formation" and what humanizer-de measures as
// stddev_mean_ratio. Prose that is correct, readable and metrically monotone.
// Sentence-length variation as a coefficient of variation: standard deviation
// over mean. The only matcher that counts nothing, so it reports a metric and
// no occurrences, and its `notable` compares against that metric instead of a
// rate. sloptells calls a low value "sentences that march in formation".
function rhythmMatcher(rule) {
  const { maxSentenceWords = 200, minSentenceWords = 1 } = rule.match || {};
  return (text) => {
    const lens = [];
    for (const part of text.split(/(?<=[.!?])\s+/)) {
      const n = (part.match(DENSITY_WORD) || []).length;
      if (n > 0) lens.push(n);
    }
    if (!lens.length) return { occurrences: [], metric: null };
    const mean = lens.reduce((x, y) => x + y, 0) / lens.length;
    if (mean > maxSentenceWords || mean < minSentenceWords) return { occurrences: [], metric: null };
    const sd = Math.sqrt(lens.reduce((x, y) => x + (y - mean) ** 2, 0) / lens.length);
    return { occurrences: [], metric: sd / mean, sentences: lens.length,
             detail: `${lens.length} sentences averaging ${Math.round(mean)} words` };
  };
}

// Syntactic-frame repetition: the Templatedness code (SQ2) from arXiv
// 2509.19163, whose own example is "Dr. Smith, a researcher at Oxford
// University, found that... Professor Johnson, a scientist at Cambridge
// University, discovered that...". `echo` cannot see this, because it looks for
// repeated *words* and every content word here differs. What repeats is the
// shape, so content words are wildcarded and only the closed class is compared.
const FUNC_WORDS = new Set(('a an the of in on at to for with by from as and or but nor so yet '
  + 'is was are were be been being has have had do does did will would can could may might must shall should '
  + 'that which who whom whose this these those it its their his her our your my '
  + 'not no if then than when where while because although though after before during over under between '
  + 'i we you he she they them us him me one two three there here about into through out up down off '
  + 's t re ve ll d m').split(' '));

const ABBREV = /\b(?:Dr|Mr|Mrs|Ms|Prof|Sr|Jr|St|vs|etc|approx|Fig|No|Inc|Ltd|Co)\.(?=\s)/g;
const FRAME_TOKEN = /[A-Za-z][A-Za-z'\u2019-]*|[,;:()"]/g;

// Abbreviation full stops are masked with a same-length placeholder before
// sentences are cut, or "Dr. Smith" becomes two sentences and every signature
// downstream is wrong. Same length keeps every offset valid.
export function sentenceSpans(text) {
  const masked = text.replace(ABBREV, (m) => m.slice(0, -1) + '\u0000');
  const out = [];
  for (const m of masked.matchAll(/[^.!?\n]*[.!?]+/g)) {
    let start = m.index;
    while (start < m.index + m[0].length && /\s/.test(text[start])) start += 1;
    if (start < m.index + m[0].length) out.push({ start, end: m.index + m[0].length });
  }
  return out;
}

// Repeated *code* lines are legitimately templated, and they carry enough
// function words to slip past the anchor guard, so frames are only compared
// between sentences that look like prose: no code punctuation, and mostly
// letters. Same trick the colon-triple rule uses.
const FRAME_CODE = /[=\[\]{}|\\<>@#$~^*/]|::|\w_\w|"""|`/;

function frameFinder(rule) {
  const { gram = 8, minRun = 3, anchors = 2, minLetters = 13, letterRatio = 0.62 } = rule.params || {};
  return (text) => {
    const spans = sentenceSpans(text).filter((sp) => {
      const t = text.slice(sp.start, sp.end);
      if ((t.match(/[A-Za-z]/g) || []).length < minLetters) return false;
      if (FRAME_CODE.test(t)) return false;
      return (t.match(/[A-Za-z\s]/g) || []).length / t.length >= letterRatio;
    });
    const sigs = spans.map((sp) => {
      const toks = text.slice(sp.start, sp.end).match(FRAME_TOKEN) || [];
      const sig = [];
      for (const t of toks) {
        if (/^[,;:()"]$/.test(t)) sig.push(t);
        else {
          const w = t.toLowerCase();
          // "an" is the same determiner as "a". Without this the paper's own
          // example fails to match itself.
          sig.push(FUNC_WORDS.has(w) ? (w === 'an' ? 'a' : w) : '_');
        }
        if (sig.length >= gram) break;
      }
      if (sig.length < gram) return null;
      // All wildcards is not a frame: it is a sentence with no closed-class
      // anchor, which in practice means code, a table row or a heading.
      if (sig.filter((x) => x !== '_').length < anchors) return null;
      return sig.join(' ');
    });

    const found = [];
    let i = 0;
    while (i < sigs.length) {
      if (!sigs[i]) { i += 1; continue; }
      let j = i;
      while (j + 1 < sigs.length && sigs[j + 1] === sigs[i]) j += 1;
      const count = j - i + 1;
      if (count >= minRun) {
        found.push({ start: spans[i].start, end: spans[j].end, count, badge: String(count),
                     badgeTitle: `${count} sentences on the frame \u201c${sigs[i]}\u201d` });
        i = j + 1;
      } else i += 1;
    }
    return found;
  };
}

const MATCHERS = {
  regex: densityMatcher,          // one matcher: occurrences of a pattern
  rhythm: rhythmMatcher,
  frame: frameFinder,
  chain: chainFinder,
  echo: echoFinder,
  'question-chain': questionChainFinder,
  anaphora: anaphoraFinder
};


// ---- the verdict ----------------------------------------------------------

// `notable` says when a count is worth reporting:
//   { above: 0 }                       any occurrence at all
//   { above: 3, per: 1000 }            a habit: 3 or more per 1000 words
//   { below: 1, per: 1000 }            an absence, which is also a tell
//   { between: [30, 85], per: 1000 }   outside a band, either side
// `needs` refuses to judge a document too short for the rate to mean anything.
// A prose gate keeps rates off config dumps and diffs, where they are noise.
function verdictOf(rule) {
  const n = rule.notable;
  if (!n) throw new Error(`rule "${rule.id}": needs a "notable" saying when it reports`);
  const band = Array.isArray(n.between) ? n.between : null;
  if (band === null && n.above === undefined && n.below === undefined) {
    throw new Error(`rule "${rule.id}": "notable" needs above, below or between`);
  }
  const per = n.per || null;
  const needs = n.needs || {};
  const minWords = needs.words ?? (per ? 250 : 0);
  const minSentences = needs.sentences ?? (per ? 5 : 0);
  const minFunctionWords = needs.functionWords ?? (per ? 0.12 : 0);
  // A rate over one occurrence is arithmetic, not evidence. `needs.matches`
  // says how many it takes before the rate is worth believing.
  const minMatches = needs.matches ?? 0;

  return (text, { occurrences, metric, sentences, detail }) => {
    const words = (text.match(DENSITY_WORD) || []).length;
    const count = occurrences.length;
    // A metric matcher reports its own value; a counting one reports a rate,
    // or a bare count when `per` is absent.
    const value = metric !== undefined && metric !== null ? metric
                : per ? (words ? (count / words) * per : 0)
                : count;
    if (metric === null) return { fires: false };
    if (per || metric !== undefined) {
      if (words < minWords) return { fires: false };
      if (minSentences) {
        const sents = sentences ?? (text.match(/[.!?](?=\s|$)/g) || []).length;
        if (sents < minSentences) return { fires: false };
      }
      if (minFunctionWords && functionWordRatio(text) < minFunctionWords) return { fires: false };
    }
    if (minMatches && count < minMatches) return { fires: false };
    const lo = band ? band[0] : n.below;
    const hi = band ? band[1] : n.above;
    // A count of occurrences is discrete and a rate is continuous, so they
    // compare differently: `above: 0` on a count means at least one, while
    // `above: 3` on a rate means 3.0 or more.
    const discrete = !per && metric === undefined;
    const under = lo !== undefined && (discrete ? value < lo : value <= lo);
    const over = hi !== undefined && (discrete ? value > hi : value >= hi);
    if (!under && !over) return { fires: false };

    const shown = per || metric !== undefined
      ? (value >= 10 ? Math.round(value) : Math.round(value * 100) / 100) : value;
    const unit = n.unit || 'words';
    const where = under ? `at or below ${lo}` : `at or above ${hi}`;
    return {
      fires: true, value, count, words,
      // A bare count with no `per` is the old span behaviour: report each
      // occurrence and say nothing about the document.
      docLevel: Boolean(per) || metric !== undefined,
      measure: metric !== undefined
        ? `${detail || ''}, variation ${shown}, ${where}`.replace(/^, /, '')
        : per ? `${count} in ${words} ${unit}, ${shown} per ${per}, ${where}`
              : `${count}`,
    };
  };
}

export function compileRule(rule, setName) {
  if (!rule.id) throw new Error('every rule needs an id');
  const m = rule.match;
  if (!m || !m.kind) throw new Error(`rule "${rule.id}": needs a "match" with a kind`);
  const build = MATCHERS[m.kind];
  if (!build) throw new Error(`rule "${rule.id}": unknown kind "${m.kind}" (expected ${KINDS.join(', ')})`);
  // Matchers read their own settings off `match`; the old shape put them at the
  // top level and in `params`, which is why one pattern needed one threshold.
  const matcher = build({ ...m, id: rule.id, params: m });
  const judge = verdictOf(rule);
  const run = (text) => {
    const got = matcher(text);
    return Array.isArray(got) ? { occurrences: got } : got;
  };
  return {
    ...rule, set: rule.set || setName, severity: rule.severity || 'warn',
    // Occurrences, always, whatever the verdict says. The two used to be fused.
    find: (text) => run(text).occurrences,
    judge: (text) => { const r = run(text); return { ...judge(text, r), occurrences: r.occurrences }; },
    fires: (text) => judge(text, run(text)).fires,
  };
}

export function compileRuleSet(json, fallbackName) {
  const name = json.name || fallbackName;
  if (!Array.isArray(json.rules)) throw new Error(`rule set "${name}" has no rules array`);
  // Ids address a rule everywhere: --select, --ignore, config, the lock file
  // and the overlap collapse in analyze(). Two rules answering to one id is
  // not a duplicate rule, it is an ambiguous one, and it fails quietly.
  const seen = new Map();
  for (const r of json.rules) {
    if (!r || !r.id) continue;             // compileRule reports a missing id
    seen.set(r.id, (seen.get(r.id) || 0) + 1);
  }
  const dupes = [...seen].filter(([, n]) => n > 1);
  if (dupes.length) {
    const list = dupes.map(([id, n]) => `"${id}" appears ${n} times`).join(', ');
    throw new Error(`rule set "${name}": every rule needs its own id, but ${list}`);
  }
  return {
    ...json, name,
    version: json.version || '0.0.0',
    rules: json.rules.map((r) => compileRule(r, name))
  };
}

/** Compare dotted versions. Returns -1, 0 or 1. Missing parts count as zero. */
export function compareVersions(a, b) {
  const pa = String(a ?? '0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b ?? '0').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

// ---- analysis -------------------------------------------------------------

// Overlapping matches collapse to the first (leftmost, then longest), so one
// stretch of prose reports once even when several rules fire on it.
export function analyze(text, rules) {
  const raw = [];
  for (const rule of rules) {
    const v = rule.judge(text);
    if (!v.fires) continue;
    if (v.docLevel) {
      // One finding for the document, carrying the occurrences so a reader can
      // see both the rate and where it came from. Anchored on the first match,
      // or the first word when there is nothing to point at.
      const first = v.occurrences[0];
      const w = DENSITY_WORD.exec(text);
      DENSITY_WORD.lastIndex = 0;
      const start = first ? first.start : (w ? w.index : 0);
      const end = first ? first.end : (w ? w.index + w[0].length : 0);
      raw.push({ start, end, rule, count: v.count, docLevel: true,
                 badge: v.measure, badgeTitle: v.measure,
                 spans: v.occurrences.map((o) => ({ start: o.start, end: o.end })) });
    } else {
      for (const m of v.occurrences) raw.push({ ...m, rule });
    }
  }
  raw.sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  let lastSpan = null;
  for (const m of raw) {
    // Document-level findings are not spans and do not compete for one.
    if (m.docLevel) { out.push(m); continue; }
    if (lastSpan && m.start < lastSpan.end) continue;
    out.push(m);
    lastSpan = m;
  }
  return out;
}

// Widen a match to the sentence containing it, for context in reports.
export function sentenceBounds(text, start, end) {
  let s = start;
  while (s > 0) {
    const ch = text[s - 1];
    if (ch === '\n' || ch === '.' || ch === '!' || ch === '?' || ch === '…') break;
    s -= 1;
  }
  while (s < start && /\s/.test(text[s])) s += 1;
  let e = end;
  while (e < text.length) {
    const ch = text[e];
    if (ch === '\n') break;
    e += 1;
    if (ch === '.' || ch === '!' || ch === '?' || ch === '…') {
      while (e < text.length && /["'”’)\]]/.test(text[e])) e += 1;
      break;
    }
  }
  return [s, e];
}

export function countWords(s) {
  const m = s.match(/\S+/g);
  return m ? m.length : 0;
}
