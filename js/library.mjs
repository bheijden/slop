// The installed rule-set library and its lock file.
//
// `.slop/rules/<name>.json` holds each installed set; the lock beside it
// records where each came from, which version, its hash and whether it passed
// its own tests at install time. The lock is the portable artifact: commit it
// and `slop restore` rebuilds the same library elsewhere.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { compileRuleSet, compareVersions } from './engine.mjs';
import { testRules } from './fudge.mjs';
import { extractMarkdown, extractHtml } from './extract.mjs';
import { libraryDir } from './config.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ENGINE_VERSION =
  JSON.parse(fs.readFileSync(path.join(HERE, '..', 'package.json'), 'utf8')).version;

export const LOCK_NAME = 'rules.lock.json';
export const lockPath = (dir = libraryDir()) => path.join(path.dirname(dir), LOCK_NAME);

export function readLock(dir = libraryDir()) {
  const p = lockPath(dir);
  if (!fs.existsSync(p)) return { slop: ENGINE_VERSION, sets: {} };
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return { slop: j.slop || ENGINE_VERSION, sets: j.sets || {} };
  } catch (e) {
    throw new Error(`cannot read ${p}: ${e.message}`);
  }
}

export function writeLock(lock, dir = libraryDir()) {
  const p = lockPath(dir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const sets = Object.fromEntries(Object.entries(lock.sets).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(p, JSON.stringify({ slop: lock.slop, sets }, null, 2) + '\n');
  return p;
}

export const hash = (json) =>
  crypto.createHash('sha256').update(JSON.stringify(json.rules)).digest('hex').slice(0, 16);

/** Compile, test, and describe a fetched rule set without installing it. */
export function inspect(json, fallbackName) {
  const set = compileRuleSet(json, fallbackName);
  const t = testRules(set.rules, { md: extractMarkdown, html: extractHtml });
  return {
    set,
    name: set.name,
    version: set.version,
    rules: set.rules.length,
    sha256: hash(json),
    failing: t.conform.fail + t.fudge.fail,
    // A set built against a newer engine may use a detector kind this one lacks.
    newerEngine: compareVersions(json.slop, ENGINE_VERSION) > 0 ? json.slop : null
  };
}

/**
 * A URL or path may hold one set, an array of sets, or a {"sets": [...]}
 * manifest naming files beside it.
 */
export async function fetchSets(src) {
  const read = async (u) => {
    if (!/^https?:\/\//i.test(u)) return JSON.parse(fs.readFileSync(u, 'utf8'));
    const res = await fetch(u, { headers: { accept: 'application/json' }, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };
  const rel = (u, f) => (/^https?:\/\//i.test(u) ? new URL(f, u).href : path.join(path.dirname(u), f));
  const stem = (u) => decodeURIComponent(u.split(/[?#]/)[0].split('/').pop() || '').replace(/\.json$/, '');

  const json = await read(src);
  if (Array.isArray(json)) {
    return json.map((j, i) => ({ src, name: j.name || `${stem(src)}-${i + 1}`, json: j }));
  }
  if (Array.isArray(json.sets)) {
    const out = [];
    for (const f of json.sets) {
      const u = rel(src, f);
      out.push({ src: u, name: stem(u), json: await read(u) });
    }
    return out;
  }
  if (Array.isArray(json.rules)) return [{ src, name: json.name || stem(src), json }];
  throw new Error('not a rule set: expected "rules", an array of sets, or a "sets" manifest');
}

export function install(json, info, src, dir = libraryDir()) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, info.name + '.json');
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
  const lock = readLock(dir);
  lock.slop = ENGINE_VERSION;
  lock.sets[info.name] = {
    version: info.version,
    source: /^https?:\/\//i.test(src) ? src : path.resolve(src),
    rules: info.rules,
    sha256: info.sha256,
    tests: info.failing ? `${info.failing} failing` : 'pass',
    installed: new Date().toISOString().slice(0, 10)
  };
  writeLock(lock, dir);
  return file;
}

export function uninstall(name, dir = libraryDir()) {
  const file = path.join(dir, name + '.json');
  if (!fs.existsSync(file)) return false;
  fs.unlinkSync(file);
  const lock = readLock(dir);
  delete lock.sets[name];
  writeLock(lock, dir);
  return true;
}
