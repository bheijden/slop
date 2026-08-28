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
import { compileRuleSet } from './engine.mjs';

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
export function resolveRules({ select = [], ignore = [], ruleSets = [], all = false, rulesDir, extraSets = [] } = {}) {
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
  const ignoredSets = new Set(ignore.filter((n) => byName.has(n)));
  const ignoredIds = new Set(ignore.filter((n) => byId.has(n) && !byName.has(n)));

  const base = select.length
    ? [...new Set([
        ...selectedSets.flatMap((n) => byName.get(n).rules),
        ...selectedIds.map((id) => byId.get(id))
      ])]
    : everyRule;

  const explicit = new Set(selectedIds);
  const rules = base.filter((r) => {
    if (ignoredIds.has(r.id) || ignoredSets.has(r.set)) return false;
    if (r.default === 'off' && !all && !explicit.has(r.id)) return false;
    return true;
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
    maxPer1000: flags.maxPer1000 ?? config.maxPer1000 ?? null,
    max: flags.max ?? config.max ?? null,
    severity: { ...(config.severity || {}), ...(flags.severity || {}) },
    // Extraction options: markdown tables and indented code blocks.
    skipTables: flags.skipTables || config.skipTables || false,
    indentCode: flags.indentCode === false ? false : (config.indentCode !== false)
  };
}
