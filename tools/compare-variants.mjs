#!/usr/bin/env node
// Scores an original rule against its proposed replacements on the same corpus.
//   AUDIT=/path/to/corpus node tools/compare-variants.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileRuleSet } from '../js/engine.mjs';

const D = process.env.AUDIT || new URL('../audit', import.meta.url).pathname;
const R = {};
for (const d of ['rules', 'candidates']) for (const f of readdirSync(new URL(`../${d}`, import.meta.url).pathname)) {
  if (!f.endsWith('.json') || f === 'index.json') continue;
  const j = JSON.parse(readFileSync(new URL(`../${d}/${f}`, import.meta.url).pathname, 'utf8'));
  if (!j.rules) continue;
  for (const r of compileRuleSet(j, j.name).rules) R[r.id] = r;
}
const load = (k) => readdirSync(join(D, k)).filter((f) => f.endsWith('.txt'))
  .map((f) => readFileSync(join(D, k, f), 'utf8'));
const H = load('human'), A = load('ai');

// original -> variants, plus the example the original exists to catch
const GROUPS = [
  ['echo-triad', ['echo-aligned', 'echo-run3', 'echo-aligned-func', 'echo-structural'],
   'A shopping cart is an object in the system. A chat room is an object in the system. A user session is an object in the system.'],
  ['moreover', ['moreover-density'], 'Moreover, the cost matters.'],
  ['stacked-questions', ['stacked-questions-run3'], 'What is it? Who is it for? Why now?'],
  ['not-just', ['not-just-tight', 'not-just-nosub'], 'This is not just a tool, but a philosophy.'],
];
const docs = (r, set) => set.filter((t) => { try { return r.find(t).length; } catch { return false; } }).length;
const hits = (r, set) => set.reduce((a, t) => { try { return a + r.find(t).length; } catch { return a; } }, 0);

console.log('Lower human is better. Higher AI is better. "canon" is the example the rule exists for.\n');
for (const [orig, vars, canon] of GROUPS) {
  console.log(`### ${orig}`);
  console.log('  rule'.padEnd(30) + 'humanDocs'.padStart(11) + 'humanHits'.padStart(11)
    + 'aiDocs'.padStart(8) + 'aiHits'.padStart(8) + '   canon');
  for (const id of [orig, ...vars]) {
    const r = R[id];
    if (!r) { console.log(`  ${id}  (not loaded)`); continue; }
    let c = false; try { c = r.find(canon).length > 0; } catch {}
    const tag = id === orig ? `  ${id} (original)` : `  ${id}`;
    console.log(tag.padEnd(30) + `${docs(r, H)}/18`.padStart(11) + String(hits(r, H)).padStart(11)
      + `${docs(r, A)}/18`.padStart(8) + String(hits(r, A)).padStart(8) + '   ' + (c ? 'yes' : 'NO'));
  }
  console.log();
}
