// The rule engine. Eight detector kinds, all driven by data from rules/*.json.
//
// Behaviour is deliberately identical to the upstream LLM cliche highlighter,
// which is what tests/conformance lets us prove. Do not "improve" a detector
// here without regenerating the rule tests.

export const KINDS = ['regex', 'chain', 'echo', 'question-chain', 'anaphora', 'density', 'rhythm', 'frame'];

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
  const { minGram = 4, minRun = 2 } = rule.params || {};
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
        const a = grams(sents[j].text, minGram);
        const b = grams(sents[j + 1].text, minGram);
        const common = [...a].filter((g) => b.has(g));
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

function densityFinder(rule) {
  const re = reOf(rule);
  const { per = 1000, min, max, minWords = 250, minMatches = 0, unit = 'words',
          prose = true, minSentences = 5, maxSentenceWords = 60, minSentenceWords = 4 } = rule.params || {};
  if (min === undefined && max === undefined) {
    throw new Error(`rule "${rule.id}": a density rule needs params.min or params.max`);
  }
  return (text) => {
    const words = (text.match(DENSITY_WORD) || []).length;
    const total = unit === 'chars' ? text.length : words;
    if (total < minWords) return [];

    // A rate over something that is not prose is meaningless, and scarcity
    // rules are the worst affected: a config dump or a diff has no commas at
    // all. Gate on there being enough sentences, of a plausible length.
    if (prose) {
      const sentences = (text.match(/[.!?](?=\s|$)/g) || []).length;
      if (sentences < minSentences) return [];
      const perSentence = words / sentences;
      if (perSentence > maxSentenceWords || perSentence < minSentenceWords) return [];
    }
    let count = 0;
    let first = null;
    for (const m of text.matchAll(re)) {
      count += 1;
      if (first === null) first = m;
    }
    if (count < minMatches) return [];
    const rate = (count / total) * per;
    const high = min !== undefined && rate >= min;
    const low = max !== undefined && rate <= max;
    if (!high && !low) return [];

    // Pile-up anchors on the first offender so the reader can see one. Scarcity
    // often has nothing to point at, so it anchors on the first word.
    let start = 0;
    let end = 0;
    if (high && first) {
      start = first.index;
      end = first.index + first[0].length;
    } else {
      const w = DENSITY_WORD.exec(text);
      DENSITY_WORD.lastIndex = 0;
      if (!w) return [];
      start = w.index;
      end = w.index + w[0].length;
    }
    const shown = rate >= 10 ? Math.round(rate) : Math.round(rate * 10) / 10;
    return [{ start, end, count, docLevel: true, badge: `${shown}/${per}`,
              badgeTitle: `${count} in ${total} ${unit}, ${shown} per ${per}, `
                          + `${high ? `at or above ${min}` : `at or below ${max}`}` }];
  };
}

// Sentence-length variation, as a coefficient of variation: standard deviation
// over mean. Low means every sentence is the same length, what sloptells calls
// "sentences that march in formation" and what humanizer-de measures as
// stddev_mean_ratio. Prose that is correct, readable and metrically monotone.
function rhythmFinder(rule) {
  const { maxCV, minCV, minWords = 250, minSentences = 8,
          maxSentenceWords = 60, minSentenceWords = 4 } = rule.params || {};
  if (maxCV === undefined && minCV === undefined) {
    throw new Error(`rule "${rule.id}": a rhythm rule needs params.maxCV or params.minCV`);
  }
  return (text) => {
    if ((text.match(DENSITY_WORD) || []).length < minWords) return [];
    const parts = text.split(/(?<=[.!?])\s+/);
    const lens = [];
    for (const part of parts) {
      const n = (part.match(DENSITY_WORD) || []).length;
      if (n > 0) lens.push(n);
    }
    if (lens.length < minSentences) return [];
    const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
    if (mean > maxSentenceWords || mean < minSentenceWords) return [];
    const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length);
    const cv = sd / mean;
    if (!((maxCV !== undefined && cv <= maxCV) || (minCV !== undefined && cv >= minCV))) return [];

    const w = DENSITY_WORD.exec(text);
    DENSITY_WORD.lastIndex = 0;
    if (!w) return [];
    const shown = Math.round(cv * 100) / 100;
    return [{ start: w.index, end: w.index + w[0].length, count: lens.length, docLevel: true,
              badge: `cv ${shown}`,
              badgeTitle: `${lens.length} sentences averaging ${Math.round(mean)} words, `
                          + `variation ${shown}, ${maxCV !== undefined && cv <= maxCV
                              ? `at or below ${maxCV}` : `at or above ${minCV}`}` }];
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

const BUILDERS = {
  regex: regexFinder,
  density: densityFinder,
  rhythm: rhythmFinder,
  frame: frameFinder,
  chain: chainFinder,
  echo: echoFinder,
  'question-chain': questionChainFinder,
  anaphora: anaphoraFinder
};

export function compileRule(rule, setName) {
  if (!rule.id) throw new Error('every rule needs an id');
  const build = BUILDERS[rule.kind];
  if (!build) throw new Error(`rule "${rule.id}": unknown kind "${rule.kind}" (expected ${KINDS.join(', ')})`);
  return { ...rule, set: rule.set || setName, severity: rule.severity || 'warn', find: build(rule) };
}

export function compileRuleSet(json, fallbackName) {
  const name = json.name || fallbackName;
  if (!Array.isArray(json.rules)) throw new Error(`rule set "${name}" has no rules array`);
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
    for (const m of rule.find(text)) {
      m.rule = rule;
      raw.push(m);
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
