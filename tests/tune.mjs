// A project can move a threshold without forking the rule, and only params move.
import { resolveRules } from '../js/config.mjs';
const base = resolveRules({});
const tuned = resolveRules({ tune: { 'colon-appositive': { min: 500 } } });
const find = (rs) => rs.rules.find((r) => r.id === 'colon-appositive');
const DOC = ('The bottleneck is not the solver: it is the model. '
  + 'The plant is a solver inside a solver: an outer optimizer searches. '
  + 'Two things follow: derivatives are exact, and scenarios are cheap. ').repeat(12);
const a = find(base), b = find(tuned);
const ok = [
  ['default fires', a.find(DOC).length > 0],
  ['tuned does not', b.find(DOC).length === 0],
  ['tuned is marked', b.tuned === true],
  ['pattern unchanged', a.pattern === b.pattern],
];
for (const [n, v] of ok) console.log(`  ${v ? 'ok  ' : 'FAIL'} ${n}`);
process.exit(ok.every(([, v]) => v) ? 0 : 1);
