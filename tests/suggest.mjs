#!/usr/bin/env node
// `suggest` is the field an agent acts on. Permission language in it gets a
// finding closed unaddressed, citing the rule's own words. Caveats belong in
// `note`, which explain prints alongside.
import { readdirSync, readFileSync } from 'node:fs';

const PERMIT = /\b(fine in|fine when|nothing (here )?is wrong|no need to|acceptable as|leave (it|them) (alone|as)|is optional|fit judgement, not a defect|if you do not)\b/i;
const bad = [];
for (const dir of ['rules', 'candidates']) {
  for (const f of readdirSync(new URL(`../${dir}`, import.meta.url).pathname)) {
    if (!f.endsWith('.json') || f === 'index.json') continue;
    const j = JSON.parse(readFileSync(new URL(`../${dir}/${f}`, import.meta.url).pathname, 'utf8'));
    for (const r of j.rules || []) {
      const m = PERMIT.exec(r.suggest || '');
      if (m) bad.push(`${j.name}/${r.id}: "${m[0]}"`);
    }
  }
}
if (bad.length) {
  console.log(`suggest audit: ${bad.length} rules license inaction in the field agents act on`);
  for (const b of bad.slice(0, 20)) console.log('  ' + b);
  console.log('  move the caveat into `note`; `suggest` states what to do');
  process.exit(1);
}
console.log('suggest audit: no rule licenses inaction in its fix');
