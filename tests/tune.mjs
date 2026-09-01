// A project can move a threshold without forking the rule, and only params move.
import { resolveRules } from '../js/config.mjs';
const base = resolveRules({});
const tuned = resolveRules({ tune: { 'colon-appositive': { above: 500 } } });
const find = (rs) => rs.rules.find((r) => r.id === 'colon-appositive');
const DOC = ('The bottleneck is not the solver: it is the model. '
  + 'The plant is a solver inside a solver: an outer optimizer searches. '
  + 'Two things follow: derivatives are exact, and scenarios are cheap. ').repeat(12);
const a = find(base), b = find(tuned);
const ok = [
  ['default fires', a.fires(DOC)],
  ['tuned does not', !b.fires(DOC)],
  ['tuned still matches', b.find(DOC).length === a.find(DOC).length],
  ['tuned is marked', b.tuned === true],
  ['pattern unchanged', a.match.pattern === b.match.pattern],
];
for (const [n, v] of ok) console.log(`  ${v ? 'ok  ' : 'FAIL'} ${n}`);
process.exit(ok.every(([, v]) => v) ? 0 : 1);
