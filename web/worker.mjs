// Rules run in a worker so the page can kill a runaway one.
//
// This is not hypothetical: the sentence detectors are quadratic on text with
// no terminator, and a rule set fetched from someone else's repo can backtrack
// forever. A worker is the only way to terminate that without freezing the tab.
import { analyze, sentenceBounds, countWords, compileRuleSet } from '../js/engine.mjs';
import { extractHtml, extractMarkdown, extractPlain, toSource } from '../js/extract.mjs';
import { variants, failureHelp } from '../js/fudge.mjs';

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

// One message carries every document, so a dropped directory costs one round
// trip rather than one per file.
function check({ docs, sets, active }) {
  const rules = [];
  for (const raw of sets) {
    for (const r of compileRuleSet(raw, raw.name).rules) if (active.includes(r.id)) rules.push(r);
  }
  return { results: docs.map((d) => checkOne(d, rules)) };
}

function checkOne({ name, src, kind }, rules) {
  const { text, runs } = (EXTRACT[kind] || extractPlain)(src, {});
  const starts = lineIndex(src);
  const findings = analyze(text, rules).map((m) => {
    const srcStart = toSource(runs, m.start);
    const srcEnd = toSource(runs, m.end);
    const a = lineCol(starts, srcStart);
    const b = lineCol(starts, srcEnd);
    const [ss, se] = sentenceBounds(text, m.start, m.end);
    return {
      line: a.line, col: a.col, endLine: b.line, endCol: b.col,
      srcStart, srcEnd, start: m.start, end: m.end,
      // Key order matches the CLI's --format json, so copied output is
      // byte-identical to what the terminal writes.
      rule: m.rule.id, set: m.rule.set, severity: m.rule.severity || 'warn',
      name: m.rule.name, why: m.rule.description, suggest: m.rule.suggest || null,
      // A density or rhythm finding measures the whole document. Its offsets are
      // an anchor, not a location, so the page must not paint them as a span.
      docLevel: m.docLevel || false, measure: m.badgeTitle || null,
      count: m.count ?? null,
      match: text.slice(m.start, m.end), sentence: text.slice(ss, se)
    };
  });
  return { name, kind, findings, text, words: countWords(text) };
}

// The same two phases the CLI runs: every tests.hit example must match on plain
// text, then survive 26 markup rewrites. A lossless variant that stops matching
// is a bug in the rule or in extraction.
function fudge({ sets }) {
  const out = [];
  for (const raw of sets) {
    for (const rule of compileRuleSet(raw, raw.name).rules) {
      const t = rule.tests || { hit: [], miss: [] };
      const row = { rule: rule.id, set: rule.set, name: rule.name,
                    // what the rule is for, which is the useful context on any row;
                    // `suggest` is advice to a prose author and means nothing here.
                    what: rule.name || rule.description || null,
                    conform: { ok: 0, fail: 0 }, fudge: { ok: 0, fail: 0, lossy: 0 }, failures: [] };
      if (!(t.hit || []).length) row.failures.push({ kind: 'no examples', detail: 'every rule needs a tests.hit example' });
      for (const ex of t.miss || []) {
        if (!rule.fires(ex)) row.conform.ok++;
        else { row.conform.fail++; row.failures.push({ kind: 'false positive', detail: ex }); }
      }
      for (const ex of t.hit || []) {
        if (!rule.fires(ex)) { row.conform.fail++; row.failures.push({ kind: 'example does not match', detail: ex }); continue; }
        const hits = rule.find(ex);
        // A metric rule counts nothing, so there is no span for the fudger to
        // preserve; the passage still has to be judged the same way.
        const [s0, e0] = hits.length ? [hits[0].start, hits[0].end] : [0, Math.min(ex.length, 1)];
        row.conform.ok++;
        for (const v of variants(ex, s0, e0)) {
          const { text } = EXTRACT[v.format](v.source, {});
          if (rule.fires(text)) { if (v.lossless) row.fudge.ok++; }
          else if (!v.lossless) row.fudge.lossy++;
          else { row.fudge.fail++; row.failures.push({ kind: v.name, detail: v.source }); }
        }
      }
      for (const f of row.failures) f.help = failureHelp(f.kind);
      out.push(row);
    }
  }
  return { results: out };
}

// Announce readiness so the page can start its timeout clock only once the
// modules are loaded. Otherwise a slow network looks exactly like a runaway
// rule, and the page kills work that never got to start.
self.postMessage({ ready: true });

self.onmessage = (e) => {
  try {
    const data = e.data.mode === 'fudge' ? fudge(e.data) : check(e.data);
    self.postMessage({ ok: true, mode: e.data.mode || 'check', ...data });
  } catch (err) {
    self.postMessage({ ok: false, error: err.message });
  }
};
