// A project can move a threshold without forking the rule, and only params move.
import { resolveRules } from '../js/config.mjs';
const base = resolveRules({});
const tuned = resolveRules({ tune: { 'colon-appositive': { '>=': 500 } } });
const find = (rs) => rs.rules.find((r) => r.id === 'colon-appositive');
const DOC = ('The bottleneck is not the solver: it is the model. '
  + 'The plant is a solver inside a solver: an outer optimizer searches. '
  + 'Two things follow: derivatives are exact, and scenarios are cheap. ').repeat(12);
const a = find(base), b = find(tuned);
// A renamed set answers to its old name. An alias must resolve a name and
// nothing more: putting it in the map the active sets are enumerated from
// loaded the set twice and doubled every finding.
const byOld = resolveRules({ select: ['mined'] });
const byNew = resolveRules({ select: ['ai-tells'] });
const ids = base.rules.map((r) => r.id);

const ok = [
  ['default fires', a.fires(DOC)],
  ['an alias selects the renamed set',
    byOld.rules.length === byNew.rules.length && byOld.rules.length > 0],
  ['an alias does not load the set twice', new Set(ids).size === ids.length],
  ['tuned does not', !b.fires(DOC)],
  ['tuned still matches', b.find(DOC).length === a.find(DOC).length],
  ['tuned is marked', b.tuned === true],
  ['pattern unchanged', a.match.pattern === b.match.pattern],
];
for (const [n, v] of ok) console.log(`  ${v ? 'ok  ' : 'FAIL'} ${n}`);
process.exit(ok.every(([, v]) => v) ? 0 : 1);
