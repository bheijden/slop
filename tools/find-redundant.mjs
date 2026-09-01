#!/usr/bin/env node
// Reports rules whose every tests.hit example is also caught by another rule,
// which is how a duplicate hides behind a different pattern. Span rules only:
// document-level rules all fire on any long fixture, so coverage there means
// the fixture is long, not that the rules overlap.
//   node tools/find-redundant.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { compileRuleSet } from '../js/engine.mjs';

// A rule that judges a rate fires on any long document, so coverage between two
// of them says the fixture is long rather than that the rules overlap. The
// distinction is the verdict now, not the kind: a bare count is span-like.
const spanLike = (r) => !(r.notable || {}).per && (r.match || {}).kind !== 'rhythm';
const all = [];
for (const dir of ['rules', 'candidates']) {
  for (const f of readdirSync(new URL(`../${dir}`, import.meta.url).pathname)) {
    if (!f.endsWith('.json') || f === 'index.json') continue;
    const j = JSON.parse(readFileSync(new URL(`../${dir}/${f}`, import.meta.url).pathname, 'utf8'));
    if (!j.rules) continue;
    const compiled = compileRuleSet(j, j.name).rules;
    compiled.forEach((r, i) => {
      if (spanLike(r)) all.push({ r, def: j.rules[i], set: j.name });
    });
  }
}

let found = 0;
for (const a of all) {
  const hits = (a.def.tests && a.def.tests.hit) || [];
  if (!hits.length) continue;
  const by = all
    .filter((b) => !(b.set === a.set && b.r.id === a.r.id))
    .filter((b) => hits.every((x) => { try { return b.r.fires(x); } catch { return false; } }));
  if (by.length) {
    found += 1;
    console.log(`  ${(a.set + '/' + a.r.id).padEnd(32)} covered by ${by.map((b) => b.set + '/' + b.r.id).join(', ')}`);
  }
}
console.log(found ? `\n${found} rules fully covered by another` : 'no rule is fully covered by another');
