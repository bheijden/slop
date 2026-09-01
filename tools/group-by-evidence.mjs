#!/usr/bin/env node
// Re-scores every mined rule against the audit corpus and writes the result back
// into each rule's `evidence` field. The grouping is derived, never hand-picked,
// so growing the corpus and re-running this is how the numbers change.
//   AUDIT=/path/to/corpus node tools/group-by-evidence.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileRuleSet } from '../js/engine.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const D = process.env.AUDIT || join(ROOT, 'audit');
const FILE = join(ROOT, 'candidates/mined.json');

const set = JSON.parse(readFileSync(FILE, 'utf8'));
const compiled = compileRuleSet(set, set.name).rules;
const load = (k) => readdirSync(join(D, k)).filter((f) => f.endsWith('.txt'))
  .map((f) => readFileSync(join(D, k, f), 'utf8'));
const H = load('human'), A = load('ai');
const docs = (r, s) => s.filter((t) => { try { return r.fires(t); } catch { return false; } }).length;
const hits = (r, s) => s.reduce((a, t) => { try { return a + (r.fires(t) ? Math.max(1, r.find(t).length) : 0); } catch { return a; } }, 0);

const tally = { proven: 0, even: 0, noisy: 0, untested: 0 };
set.rules.forEach((def, i) => {
  const r = compiled[i];
  const hd = docs(r, H), ad = docs(r, A), hh = hits(r, H), ah = hits(r, A);
  if (!hh && !ah) { def.evidence = 'Never fired on the audit corpus, on either side. No evidence either way.'; tally.untested++; }
  else {
    def.evidence = `On the audit corpus: ${hh} hit${hh === 1 ? '' : 's'} in ${hd}/${H.length} human documents, `
      + `${ah} in ${ad}/${A.length} AI documents.`;
    if (ah > 0 && (hd === 0 || ah >= hh * 3)) tally.proven++;
    else if (hh > ah) tally.noisy++;
    else tally.even++;
  }
});
writeFileSync(FILE, JSON.stringify(set, null, 2) + '\n');
console.log(`mined.json: ${set.rules.length} rules re-scored`);
for (const [k, v] of Object.entries(tally)) console.log(`  ${String(v).padStart(3)}  ${k}`);
