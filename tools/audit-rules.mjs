#!/usr/bin/env node
// Per-rule audit: what each rule hits, with the matched text, so a finding
// can be judged rather than counted. See research/audit.md.
//   AUDIT=/path/to/corpus node tools/audit-rules.mjs

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileRuleSet } from '../js/engine.mjs';
const D = process.env.AUDIT || new URL('../audit', import.meta.url).pathname;
const W = /[A-Za-z0-9][A-Za-z0-9'’-]*/g;
const RULES = [];
for (const d of ['rules', 'candidates']) for (const f of readdirSync(new URL(`../${d}`, import.meta.url).pathname)) {
  if (!f.endsWith('.json') || f === 'index.json') continue;
  const j = JSON.parse(readFileSync(new URL(`../${d}/${f}`, import.meta.url).pathname, 'utf8'));
  // measured-* are views over the same rule ids and `variants` holds
  // alternatives to rules that are already counted; including either would
  // tally the same rule twice under one id.
  if (!j.rules || j.name.startsWith('measured-') || j.name === 'variants' || j.role === 'style') continue;
  for (const r of compileRuleSet(j, j.name).rules) RULES.push(r);
}
const load = (k) => readdirSync(join(D, k)).filter(f => f.endsWith('.txt'))
  .map(f => { const text = readFileSync(join(D, k, f), 'utf8');
              return { f, text, reg: f.split('-')[0], words: (text.match(W) || []).length }; });
const human = load('human'), ai = load('ai');

const hit = (r, docs) => { const out = []; for (const d of docs) { let m = []; try { m = r.fires(d.text) ? r.find(d.text) : []; } catch {}
  for (const x of m) out.push({ doc: d.f, reg: d.reg, text: d.text.slice(x.start, x.end).replace(/\s+/g, ' ').slice(0, 62) }); } return out; };

const rows = RULES.map(r => { const h = hit(r, human), a = hit(r, ai);
  return { r, h, a, hDocs: new Set(h.map(x => x.doc)).size, aDocs: new Set(a.map(x => x.doc)).size }; });

console.log('===============================================================================');
console.log(' RULES THAT FIRE ON PRE-2022 HUMAN PROSE  (false-positive candidates)');
console.log('===============================================================================\n');
for (const x of rows.filter(x => x.h.length).sort((a, b) => b.hDocs - a.hDocs || b.h.length - a.h.length)) {
  const regs = [...new Set(x.h.map(v => v.reg))].join(' ');
  console.log(`${x.r.id}  [${x.r.set}]`);
  console.log(`   human: ${x.h.length} hits in ${x.hDocs}/18 docs (${regs})    AI: ${x.a.length} hits in ${x.aDocs}/18 docs`);
  for (const s of x.h.slice(0, 3)) console.log(`     H "${s.text}"`);
  for (const s of x.a.slice(0, 1)) console.log(`     A "${s.text}"`);
  console.log();
}
console.log('===============================================================================');
console.log(' RULES THAT FIRE ONLY ON AI  (clean, in this corpus)');
console.log('===============================================================================\n');
for (const x of rows.filter(x => !x.h.length && x.a.length).sort((a, b) => b.aDocs - a.aDocs)) {
  console.log(`${x.r.id}  [${x.r.set}]  ${x.a.length} hits in ${x.aDocs}/18 AI docs`);
  for (const s of x.a.slice(0, 2)) console.log(`     A "${s.text}"`);
}
const silent = rows.filter(x => !x.h.length && !x.a.length);
console.log(`\n=== NEVER FIRED: ${silent.length} of ${RULES.length} rules ===`);
const bySet = {};
for (const x of silent) (bySet[x.r.set] ||= []).push(x.r.id);
for (const [s, ids] of Object.entries(bySet).sort((a,b)=>b[1].length-a[1].length)) console.log(`  ${String(ids.length).padStart(3)}  ${s}`);
