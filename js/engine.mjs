// The rule engine. Five detector kinds, all driven by data from rules/*.json.
//
// Behaviour is deliberately identical to the upstream LLM cliche highlighter,
// which is what tests/conformance lets us prove. Do not "improve" a detector
// here without regenerating the rule tests.

export const KINDS = ['regex', 'chain', 'echo', 'question-chain', 'anaphora'];

const CHAIN_BODY = String.raw`[^,.;:!?\n–—…]*`;
const CHAIN_SEP = String.raw`(?:\s*,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+|\s*[;&–—]\s*(?:and\s+|or\s+)?|\s+-{1,2}\s+)`;
const CHAIN_SPLIT = new RegExp(CHAIN_SEP, 'i');

const ANAPHORA_SKIP = /^(?:i|it|the|a|an|this|that|we|you|they|he|she|there|but|and|so|in|as|if|my|his|her|their|its|these|those|for|at|on|of|to|is|was)$/i;

function reOf(rule) {
  const flags = rule.flags && rule.flags.includes('i') ? 'gi' : 'g';
  try {
    return new RegExp(rule.pattern, flags);
  } catch (err) {
    throw new Error(`rule "${rule.id}": bad pattern — ${err.message}`);
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

const BUILDERS = {
  regex: regexFinder,
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
  return { ...json, name, rules: json.rules.map((r) => compileRule(r, name)) };
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
  for (const m of raw) {
    const last = out[out.length - 1];
    if (last && m.start < last.end) continue;
    out.push(m);
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
