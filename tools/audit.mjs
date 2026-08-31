#!/usr/bin/env node
// Scores every rule against a matched human/AI corpus. See research/audit.md.
//   node tools/audit.mjs        (expects audit/human/*.txt and audit/ai/*.txt)
// AUDIT=/path/to/corpus node tools/audit.mjs

// Per-rule audit. Every number here is computed from the corpus, not reported by an agent.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { compileRuleSet, analyze } from '../js/engine.mjs';

const DIR = process.env.AUDIT || new URL('../audit', import.meta.url).pathname;
const W = /[A-Za-z0-9][A-Za-z0-9'’-]*/g;

// Every rule in the project, slop and style alike.
const SETS = [];
for (const d of ['rules', 'candidates']) {
  for (const f of readdirSync(new URL(`../${d}`, import.meta.url).pathname)) {
    if (!f.endsWith('.json') || f === 'index.json') continue;
    const j = JSON.parse(readFileSync(new URL(`../${d}/${f}`, import.meta.url).pathname, 'utf8'));
    // measured-* are views over the same rule ids and `variants` holds
  // alternatives to rules that are already counted; including either would
  // tally the same rule twice under one id.
  if (!j.rules || j.name.startsWith('measured-') || j.name === 'variants') continue;
    SETS.push({ ...compileRuleSet(j), role: j.role || 'slop' });
  }
}
const RULES = SETS.flatMap((s) => s.rules.map((r) => ({ ...r, setRole: s.role, setName: s.name })));

function load(kind) {
  const dir = join(DIR, kind);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.txt')).map((f) => {
    const text = readFileSync(join(dir, f), 'utf8');
    return { file: basename(f), register: basename(f).split('-')[0],
             words: (text.match(W) || []).length, text };
  }).filter((d) => d.words >= 250);
}

const human = load('human');
const ai = load('ai');
if (!human.length) { console.log('no corpus yet'); process.exit(0); }

function tally(docs) {
  const spans = new Map();   // ruleId -> total matches
  const docsHit = new Map(); // ruleId -> documents with >=1 match
  let words = 0;
  for (const d of docs) {
    words += d.words;
    for (const r of RULES) {
      let n = 0;
      try { n = r.find(d.text).length; } catch { n = 0; }
      if (!n) continue;
      spans.set(r.id, (spans.get(r.id) || 0) + n);
      docsHit.set(r.id, (docsHit.get(r.id) || 0) + 1);
    }
  }
  return { spans, docsHit, words, n: docs.length };
}

const H = tally(human);
const A = tally(ai);
const rate = (t, id) => t.words ? (t.spans.get(id) || 0) / t.words * 1000 : 0;

console.log(`corpus: ${H.n} human documents (${H.words} words), ${A.n} AI documents (${A.words} words)`);
console.log(`registers: ${[...new Set(human.map((d) => d.register))].join(', ')}\n`);

const rows = RULES.map((r) => ({
  id: r.id, set: r.setName, role: r.setRole, kind: r.kind,
  hRate: rate(H, r.id), aRate: rate(A, r.id),
  hDocs: H.docsHit.get(r.id) || 0, aDocs: A.docsHit.get(r.id) || 0,
})).filter((x) => x.hDocs || x.aDocs);

const pct = (a, b) => b ? `${Math.round(a / b * 100)}%` : '0%';

console.log('=== RULES THAT FIRE ON PRE-2022 HUMAN PROSE (false-positive candidates) ===');
console.log('sorted by share of human documents flagged\n');
console.log('rule'.padEnd(38) + 'set'.padEnd(20) + 'human'.padStart(12) + 'AI'.padStart(12) + '   ratio');
for (const x of rows.filter((r) => r.hDocs).sort((a, b) => b.hDocs - a.hDocs || b.hRate - a.hRate)) {
  const ratio = x.hRate > 0 ? (x.aRate / x.hRate).toFixed(1) + '×' : (x.aRate ? 'inf' : '-');
  const h = `${pct(x.hDocs, H.n)} ${x.hRate.toFixed(1)}`;
  const a = `${pct(x.aDocs, A.n)} ${x.aRate.toFixed(1)}`;
  console.log(x.id.padEnd(38) + x.set.padEnd(20) + h.padStart(12) + a.padStart(12) + '   ' + ratio);
}

console.log('\n=== RULES THAT FIRE ONLY ON AI PROSE (clean discriminators) ===\n');
const clean = rows.filter((r) => !r.hDocs && r.aDocs).sort((a, b) => b.aDocs - a.aDocs);
for (const x of clean) console.log('  ' + x.id.padEnd(38) + x.set.padEnd(20) + `${pct(x.aDocs, A.n)} of AI docs, ${x.aRate.toFixed(1)}/1k`);
if (!clean.length) console.log('  (none)');

console.log('\n=== SILENT ON BOTH ===');
const silent = RULES.filter((r) => !H.docsHit.get(r.id) && !A.docsHit.get(r.id));
console.log(`  ${silent.length} of ${RULES.length} rules never fired on either corpus`);

console.log('\n=== BY REGISTER: slop findings per 1000 words, human vs AI ===\n');
const regs = [...new Set([...human, ...ai].map((d) => d.register))].sort();
console.log('register'.padEnd(16) + 'human/1k'.padStart(10) + 'AI/1k'.padStart(10) + '   verdict');
for (const g of regs) {
  const hh = tally(human.filter((d) => d.register === g));
  const aa = tally(ai.filter((d) => d.register === g));
  const slopIds = RULES.filter((r) => r.setRole !== 'style').map((r) => r.id);
  const sum = (t) => slopIds.reduce((s, id) => s + (t.spans.get(id) || 0), 0);
  const hr = hh.words ? sum(hh) / hh.words * 1000 : 0;
  const ar = aa.words ? sum(aa) / aa.words * 1000 : 0;
  const v = !hh.words || !aa.words ? 'incomplete' : ar > hr * 1.5 ? 'AI fires more' : ar < hr * 0.67 ? 'HUMAN fires more' : 'no separation';
  console.log(g.padEnd(16) + hr.toFixed(1).padStart(10) + ar.toFixed(1).padStart(10) + '   ' + v);
}

// Re-cut: only the AI-detection rules, and only the sets that ship on by
// default, so the house-style em-dash rule and the register profiles are not
// mixed into a claim about detection.
const SHIPPED = new Set(['simonwillison', 'wikipedia-ai']);
const detect = RULES.filter((r) => r.setRole !== 'style' && r.setName !== 'em-dash');
const shipped = RULES.filter((r) => SHIPPED.has(r.setName));
console.log('\n=== DETECTION ONLY (no em-dash, no style profiles) ===\n');
console.log('register'.padEnd(14) + 'shipped h/AI'.padStart(16) + 'all slop h/AI'.padStart(18));
for (const g of [...new Set(human.map((d) => d.register))].sort()) {
  const hh = tally(human.filter((d) => d.register === g));
  const aa = tally(ai.filter((d) => d.register === g));
  const r = (t, set) => t.words ? set.reduce((s, x) => s + (t.spans.get(x.id) || 0), 0) / t.words * 1000 : 0;
  console.log(g.padEnd(14)
    + `${r(hh, shipped).toFixed(1)} / ${r(aa, shipped).toFixed(1)}`.padStart(16)
    + `${r(hh, detect).toFixed(1)} / ${r(aa, detect).toFixed(1)}`.padStart(18));
}
const H2 = tally(human), A2 = tally(ai);
const tot = (t, set) => set.reduce((s, x) => s + (t.spans.get(x.id) || 0), 0) / t.words * 1000;
console.log('\n  OVERALL shipped sets:  human ' + tot(H2, shipped).toFixed(2) + ' / AI ' + tot(A2, shipped).toFixed(2) + ' per 1000');
console.log('  OVERALL all slop sets: human ' + tot(H2, detect).toFixed(2) + ' / AI ' + tot(A2, detect).toFixed(2) + ' per 1000');

console.log('\n=== echo-triad: what is it actually hitting in human prose? ===');
const et = RULES.find((r) => r.id === 'echo-triad');
let shown = 0;
for (const d of human) {
  for (const m of et.find(d.text)) {
    if (shown++ >= 4) break;
    console.log(`  [${d.file}] ${d.text.slice(m.start, m.start + 150).replace(/\s+/g, ' ')}…`);
  }
  if (shown >= 4) break;
}

console.log('\n=== PER-SET SCORECARD (slop sets only) ===\n');
console.log('set'.padEnd(20) + 'rules'.padStart(6) + 'silent'.padStart(8) + 'human/1k'.padStart(10)
  + 'AI/1k'.padStart(8) + 'ratio'.padStart(8) + '  human docs hit');
const bySet = new Map();
for (const r of RULES.filter((x) => x.setRole !== 'style')) {
  if (!bySet.has(r.setName)) bySet.set(r.setName, []);
  bySet.get(r.setName).push(r);
}
const scored = [];
for (const [name, rs] of bySet) {
  const hr = rs.reduce((s, x) => s + (H.spans.get(x.id) || 0), 0) / H.words * 1000;
  const ar = rs.reduce((s, x) => s + (A.spans.get(x.id) || 0), 0) / A.words * 1000;
  const silent = rs.filter((x) => !H.docsHit.get(x.id) && !A.docsHit.get(x.id)).length;
  const hdocs = new Set();
  for (const d of human) for (const x of rs) { try { if (x.find(d.text).length) hdocs.add(d.file); } catch {} }
  scored.push({ name, n: rs.length, silent, hr, ar, ratio: hr > 0 ? ar / hr : (ar ? Infinity : 1), hdocs: hdocs.size });
}
for (const s of scored.sort((a, b) => b.ratio - a.ratio)) {
  const ratio = s.hr === 0 && s.ar === 0 ? '-' : s.hr === 0 ? 'clean' : s.ratio.toFixed(1) + '×';
  console.log(s.name.padEnd(20) + String(s.n).padStart(6) + String(s.silent).padStart(8)
    + s.hr.toFixed(2).padStart(10) + s.ar.toFixed(2).padStart(8) + ratio.padStart(8)
    + `  ${Math.round(s.hdocs / H.n * 100)}%`.padStart(8));
}
