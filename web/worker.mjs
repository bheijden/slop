// Rules run in a worker so the page can kill a runaway one.
//
// This is not hypothetical: the sentence detectors are quadratic on text with
// no terminator, and a user-supplied regex can backtrack forever. A worker is
// the only way to terminate that without freezing the tab.
import { analyze, sentenceBounds, countWords, compileRuleSet } from '../js/engine.mjs';
import { extractHtml, extractMarkdown, extractPlain, toSource } from '../js/extract.mjs';

const EXTRACT = { html: extractHtml, md: extractMarkdown, txt: extractPlain };

function lineIndex(src) {
  const s = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') s.push(i + 1);
  return s;
}
function lineCol(starts, off) {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= off) lo = mid; else hi = mid - 1; }
  return { line: lo + 1, col: off - starts[lo] + 1 };
}

self.onmessage = (e) => {
  const { src, kind, sets, active } = e.data;
  try {
    const rules = [];
    for (const raw of sets) {
      for (const r of compileRuleSet(raw, raw.name).rules) {
        if (active.includes(r.id)) rules.push(r);
      }
    }
    const { text, runs } = (EXTRACT[kind] || extractPlain)(src, {});
    const starts = lineIndex(src);
    const findings = analyze(text, rules).map((m) => {
      const srcStart = toSource(runs, m.start);
      const srcEnd = toSource(runs, m.end);
      const a = lineCol(starts, srcStart);
      const [ss, se] = sentenceBounds(text, m.start, m.end);
      return {
        line: a.line, col: a.col, srcStart, srcEnd,
        start: m.start, end: m.end, count: m.count ?? null,
        rule: m.rule.id, set: m.rule.set, name: m.rule.name,
        why: m.rule.description, suggest: m.rule.suggest || null,
        match: text.slice(m.start, m.end), sentence: text.slice(ss, se)
      };
    });
    self.postMessage({ ok: true, findings, text, words: countWords(text) });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message });
  }
};
