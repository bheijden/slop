// Rule-set resolution: which rules are active for this run.
//
// Precedence, lowest to highest:
//   built-in sets in rules/  ->  slop.json  ->  command-line flags
//
// `select` and `ignore` both accept either a SET NAME ("simonwillison") or a
// RULE ID ("colon-triple"), the way ruff accepts both "E" and "E501".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileRuleSet, compileRule } from './engine.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BUILTIN_DIR = path.join(HERE, '..', 'rules');
export const CONFIG_NAME = 'slop.json';
// Rule sets fetched with `slop add` live here, beside the config, so a
// project can commit them and everyone gets the same rules.
export const LIBRARY_DIR = '.slop/rules';

export function loadSetFile(file) {
  let json;
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`cannot load rule set ${file}: ${err.message}`);
  }
  return compileRuleSet(json, path.basename(file).replace(/\.json$/, ''));
}

// A rule set can live on someone else's site. Fetching one runs their patterns
// on your text, so read it first: the browser caps a runaway rule with a worker
// timeout, the CLI does not.
export async function fetchSetUrl(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`cannot load rule set ${url}: HTTP ${res.status}`);
  return compileRuleSet(await res.json(), url.replace(/^.*\//, '').replace(/\.json$/, ''));
}

// Where downloaded sets live for this project: beside slop.json if there
// is one, otherwise under the working directory.
export function libraryDir(from = process.cwd()) {
  const cfg = findConfig(from);
  return path.join(cfg ? path.dirname(cfg) : path.resolve(from), LIBRARY_DIR);
}

export function loadLibrarySets(dir = libraryDir()) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const set = loadSetFile(path.join(dir, f));
      set.installed = path.join(dir, f);
      return set;
    });
}

export function loadBuiltinSets(dir = BUILTIN_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f !== 'index.json') // index.json is the web manifest
    .sort()
    .map((f) => loadSetFile(path.join(dir, f)));
}

// Walk up from `from` looking for slop.json.
export function findConfig(from = process.cwd()) {
  let dir = path.resolve(from);
  for (;;) {
    const p = path.join(dir, CONFIG_NAME);
    if (fs.existsSync(p)) return p;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

export function loadConfig(file) {
  if (!file) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`cannot read ${file}: ${err.message}`);
  }
}

/**
 * @param {object} o
 * @param {string[]} o.select   set names or rule ids; empty means "all built-in sets"
 * @param {string[]} o.ignore   set names or rule ids
 * @param {string[]} o.ruleSets extra rule-set JSON files to load
 * @param {boolean}  o.all      include rules marked "default":"off"
 * @returns {{rules: object[], sets: object[], available: object[]}}
 */
export function resolveRules({ select = [], ignore = [], ruleSets = [], all = false, tune = {}, rulesDir, extraSets = [] } = {}) {
  const sets = [
    ...loadBuiltinSets(rulesDir),
    ...loadLibrarySets(),
    ...ruleSets.filter((r) => !/^https?:\/\//i.test(r)).map(loadSetFile),
    ...extraSets
  ];
  // Later sources shadow earlier ones by name, so an installed or explicitly
  // pointed-at set can replace a built-in of the same name. That is how you pin
  // or customise the rules that ship here.
  const byName = new Map();
  for (const s of sets) {
    if (byName.has(s.name)) s.shadows = byName.get(s.name);
    byName.set(s.name, s);
  }
  const active = [...byName.values()];
  // A renamed set answers to what it used to be called, so a slop.json or a
  // shared link written against the old name keeps working. Aliases resolve
  // names and nothing else: putting one in `byName` would enumerate the set
  // twice and double every finding. A real set of that name always wins.
  for (const s of active) {
    for (const a of s.aliases || []) if (!byName.has(a)) byName.set(a, s);
  }
  const everyRule = active.flatMap((s) => s.rules);
  const byId = new Map(everyRule.map((r) => [r.id, r]));

  const check = (names, what) => {
    for (const n of names) {
      if (!byName.has(n) && !byId.has(n)) {
        throw new Error(`${what}: "${n}" is not a rule set or rule id (try --list)`);
      }
    }
  };
  check(select, 'select');
  check(ignore, 'ignore');

  const selectedSets = select.filter((n) => byName.has(n));
  const selectedIds = select.filter((n) => byId.has(n) && !byName.has(n));

  // You write in one house style. Two style profiles at once would report a
  // document as simultaneously too formal and not formal enough, so refuse it
  // rather than average two registers into nonsense.
  const styles = selectedSets.filter((n) => byName.get(n).role === 'style');
  if (styles.length > 1) {
    throw new Error(`select: pick one style profile, not ${styles.length} (${styles.join(', ')}). `
      + 'Style profiles are registers, and a document cannot sit in two of them at once.');
  }
  const ignoredSets = new Set(ignore.filter((n) => byName.has(n)));
  const ignoredIds = new Set(ignore.filter((n) => byId.has(n) && !byName.has(n)));

  const base = select.length
    ? [...new Set([
        ...selectedSets.flatMap((n) => byName.get(n).rules),
        ...selectedIds.map((id) => byId.get(id))
      ])]
    : everyRule;

  // Naming a set is as explicit as naming a rule, so it lifts `default: "off"`
  // for that set. Without this a set whose rules are all off-by-default -- every
  // style profile -- selects to nothing, which is what it used to do.
  const explicit = new Set(selectedIds);
  const explicitSets = new Set(selectedSets);
  const rules = base.filter((r) => {
    if (ignoredIds.has(r.id) || ignoredSets.has(r.set)) return false;
    if (r.default === 'off' && !all && !explicit.has(r.id) && !explicitSets.has(r.set)) return false;
    return true;
  // A rate that is right for one register is wrong for another, so a project
  // can move a threshold without forking the rule. Only params are tunable:
  // the pattern stays the rule author's.
  }).map((r) => {
    if (!tune[r.id]) return r;
    // Recompiled, not patched: the finder closed over the original params when
    // the set was compiled, so changing them afterwards would do nothing.
    const notable = { ...(r.notable || {}), ...tune[r.id] };
    return { ...compileRule({ ...r, notable }, r.set), tuned: true };
  });

  return { rules, sets: active, available: everyRule };
}

// Merge a config file with CLI flags. CLI wins; lists concatenate.
export function mergeConfig(config = {}, flags = {}) {
  const list = (a, b) => [...new Set([...(a || []), ...(b || [])])];
  return {
    select: flags.select && flags.select.length ? flags.select : (config.select || []),
    ignore: list(config.ignore, flags.ignore),
    ruleSets: list(config.ruleSets, flags.ruleSets),
    all: flags.all ?? config.all ?? false,
    exclude: list(config.exclude, flags.exclude),
    tune: { ...(config.tune || {}) },
    maxPer1000: flags.maxPer1000 ?? config.maxPer1000 ?? null,
    max: flags.max ?? config.max ?? null,
    severity: { ...(config.severity || {}), ...(flags.severity || {}) },
    // Extraction options: markdown tables and indented code blocks.
    skipTables: flags.skipTables || config.skipTables || false,
    indentCode: flags.indentCode === false ? false : (config.indentCode !== false)
  };
}
