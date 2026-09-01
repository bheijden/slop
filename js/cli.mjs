#!/usr/bin/env node
// slop - a prose linter with pluggable rule sets.
//
//   slop README.md docs/                 lint files and directories
//   slop https://example.com/post        lint a URL (fetched, then treated as HTML)
//   slop --format json .                 machine-readable, for agents and CI
//   slop list                            show every rule
//   slop explain note-that               show one rule in detail
//   slop test-rules rules/mine.json      conformance + markup fudging

import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { analyze, sentenceBounds, countWords } from './engine.mjs';
import { resolveRules, findConfig, loadConfig, mergeConfig, fetchSetUrl,
         libraryDir, loadLibrarySets, loadSetFile } from './config.mjs';
import { compareVersions } from './engine.mjs';
import { BUILTIN_DIR as BUILTIN } from './config.mjs';
import { testRules } from './fudge.mjs';
import { ENGINE_VERSION, fetchSets, inspect, install, uninstall,
         readLock, writeLock, lockPath } from './library.mjs';
import { extractorFor, extractHtml, extractMarkdown, toSource } from './extract.mjs';

process.stdout.on('error', (e) => { if (e.code === 'EPIPE') process.exit(0); throw e; });

const EXT = /\.(md|markdown|mdown|mdx|html|htm|xhtml|txt|text|rst)$/i;
const isUrl = (s) => /^https?:\/\//i.test(s);

const HELP = `slop - prose linting with pluggable rule sets

  slop [check] <file|dir|url> ...
  slop list | explain <rule>
  slop test-rules [set.json]   (alias: fudge) - check a rule set

Rule library
  slop sets                    what is installed, active, and passing
  slop add <url>               download a rule set into .slop/rules/
  slop update [name]           re-fetch from the recorded source (--check to only report)
                                     a set failing its own tests is held back; --force installs it anyway
  slop remove <name>           delete an installed set
  slop restore [lock.json]     reinstall everything a lock file names
  cat draft.md | slop -

Rule selection (a name works for a whole set or a single rule id)
  --select IDS       only these rule sets or rules      (default: every built-in set)
  --ignore IDS       drop these rule sets or rules
  --rules FILE|URL   load an extra rule set, from disk or over https (repeatable)
  --all              include rules marked "default": "off" (currently none)

Output
  --format FMT       human (default), json, tsv, github
  --no-context       omit the surrounding sentence
  --no-suggest       omit the suggested fix
  -q, --quiet        summary only

Budget
  --max N            fail above N findings         (off by default)
  --max-per-1000 N   fail above N findings per 1000 words (off by default)
  --exit-zero        always exit 0
  -f, --force        install a rule set even when it fails its own tests

Files
  -r, --recursive    walk directories
  --exclude GLOB     skip paths containing this substring (repeatable)
  --no-indent-code   keep 4-space indented markdown blocks
  --skip-tables      drop markdown table rows

  --share            print a link that opens these files in the web viewer
  --share-base URL   where that link points (default: the GitHub Pages site)
  --config FILE      use this slop.json (default: nearest one up the tree)
  --no-config        ignore any slop.json

Exit codes: 0 clean, 1 over budget, 2 usage or read error.`;

function parseArgs(argv) {
  const o = { cmd: 'check', args: [], select: [], ignore: [], ruleSets: [], exclude: [],
              all: false, format: 'human', context: true, suggest: true, quiet: false,
              max: null, maxPer1000: null, exitZero: false, recursive: false,
              indentCode: true, skipTables: false, config: undefined, noConfig: false,
              share: false, shareBase: 'https://bheijden.github.io/slop/', help: false };
  const ids = (v) => v.split(/[,\s]+/).filter(Boolean);
  if (['list', 'explain', 'test-rules', 'fudge', 'check', 'add', 'remove', 'sets', 'update', 'restore'].includes(argv[0])) o.cmd = argv.shift();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    switch (a) {
      case '-h': case '--help': o.help = true; break;
      case '--select': o.select.push(...ids(next())); break;
      case '--ignore': o.ignore.push(...ids(next())); break;
      case '--rules': o.ruleSets.push(next()); break;
      case '--all': o.all = true; break;
      case '--format': o.format = next(); break;
      case '--json': o.format = 'json'; break;
      case '--no-context': o.context = false; break;
      case '--no-suggest': o.suggest = false; break;
      case '-q': case '--quiet': o.quiet = true; break;
      case '--max': o.max = parseInt(next(), 10); break;
      case '--max-per-1000': o.maxPer1000 = parseFloat(next()); break;
      case '--exit-zero': o.exitZero = true; break;
      case '-r': case '--recursive': o.recursive = true; break;
      case '--exclude': o.exclude.push(next()); break;
      case '--no-indent-code': o.indentCode = false; break;
      case '--skip-tables': o.skipTables = true; break;
      case '--config': o.config = next(); break;
      case '--share': o.share = true; break;
      case '--share-base': o.shareBase = next(); break;
      case '--check': o.checkOnly = true; break;
      case '-f': case '--force': o.force = true; break;
      case '--no-config': o.noConfig = true; break;
      case '--': argv.slice(i + 1).forEach((f) => o.args.push(f)); i = argv.length; break;
      default:
        if (a.startsWith('--') || (a.startsWith('-') && a.length > 1 && a !== '-')) throw new Error(`unknown option ${a}`);
        o.args.push(a);
    }
  }
  // The subcommand may also follow flags: `slop --config x list`.
  if (o.cmd === 'check' && ['list', 'explain', 'test-rules', 'fudge', 'add', 'remove', 'sets', 'update', 'restore'].includes(o.args[0])) o.cmd = o.args.shift();
  if (!['human', 'json', 'github', 'tsv'].includes(o.format)) throw new Error(`unknown --format ${o.format}`);
  return o;
}

const C = process.stdout.isTTY && !process.env.NO_COLOR
  ? { dim: (s) => `\x1b[2m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m`,
      yellow: (s) => `\x1b[33m${s}\x1b[0m`, cyan: (s) => `\x1b[36m${s}\x1b[0m`,
      red: (s) => `\x1b[31m${s}\x1b[0m`, green: (s) => `\x1b[32m${s}\x1b[0m` }
  : new Proxy({}, { get: () => (s) => s });

// Pad to a visible width, ignoring the ANSI colour codes in the string.
const pad = (s, n) => s + ' '.repeat(Math.max(1, n - s.replace(/\x1b\[[0-9;]*m/g, '').length));

const oneLine = (s, n = 100) => {
  const c = s.replace(/\s+/g, ' ').trim();
  return c.length > n ? c.slice(0, n - 1) + '…' : c;
};

function walk(dir, out, exclude) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (exclude.some((x) => p.includes(x))) continue;
    if (e.isDirectory()) walk(p, out, exclude);
    else if (EXT.test(e.name)) out.push(p);
  }
  return out;
}

async function readSource(target) {
  if (target === '-') return { name: '<stdin>', src: fs.readFileSync(0, 'utf8'), kind: 'md' };
  if (isUrl(target)) {
    // A URL is just a file we do not have yet: fetch it, then take the same
    // path as a local .html file.
    const res = await fetch(target, { headers: { accept: 'text/html,text/plain' }, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = res.headers.get('content-type') || '';
    return { name: target, src: await res.text(), kind: /html/i.test(ct) ? 'html' : /markdown/i.test(ct) ? 'md' : 'html' };
  }
  return { name: target, src: fs.readFileSync(target, 'utf8'), kind: null };
}

function lineIndex(src) {
  const s = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') s.push(i + 1);
  return s;
}
function lineCol(starts, off) {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= off) lo = mid; else hi = mid - 1; }
  return { line: lo + 1, col: off - starts[lo] + 1 };
}

function lintSource(name, src, kind, rules, opts) {
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  const extract = kind === 'html' ? extractHtml : kind === 'md' ? extractMarkdown : extractorFor(name);
  const { text, runs } = extract(src, { indentCode: opts.indentCode, skipTables: opts.skipTables });
  const starts = lineIndex(src);
  const findings = analyze(text, rules).map((m) => {
    const a = lineCol(starts, toSource(runs, m.start));
    const b = lineCol(starts, toSource(runs, m.end));
    const [ss, se] = sentenceBounds(text, m.start, m.end);
    const r = m.rule;
    return { file: name, line: a.line, col: a.col, endLine: b.line, endCol: b.col,
             rule: r.id, set: r.set, severity: r.severity, name: r.name,
             why: r.description, suggest: r.suggest || null,
             count: m.count ?? null, match: text.slice(m.start, m.end), sentence: text.slice(ss, se),
             // A density or rhythm rule measures the whole document. It has to
             // anchor somewhere to have an offset at all, but that anchor is an
             // artefact: reporting it as line:col points the reader at an
             // innocent word. Carry the flag so the reporter can say "document".
             docLevel: m.docLevel || false, measure: m.badgeTitle || null,
             // `measure` is one line for a terminal. `rate` is the same numbers
             // apart, so a consumer can lay them out or threshold on them.
             rate: m.rate || null,
             // Where the rate came from. A document-level finding without its
             // occurrences is a number nobody can act on.
             occurrences: (m.spans || []).map((sp) => {
               const c = lineCol(starts, toSource(runs, sp.start));
               // A window, not the bare match: patterns like `[a-z,)]: +[a-z]`
               // match four characters, which tells a reader nothing.
               const a = Math.max(0, sp.start - 34);
               const b = Math.min(text.length, sp.end + 34);
               return { line: c.line, col: c.col,
                        match: text.slice(sp.start, sp.end),
                        context: (a > 0 ? '…' : '') + text.slice(a, b).replace(/\s+/g, ' ').trim()
                                 + (b < text.length ? '…' : '') };
             }),
             // The rates behind the threshold, so whoever reads the finding can
             // judge the number instead of taking it on trust.
             reference: r.reference || null };
  });
  return { file: name, words: countWords(text), findings };
}

async function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); }
  catch (e) { process.stderr.write(`slop: ${e.message}\n`); return 2; }
  if (o.help) { process.stdout.write(HELP + '\n'); return 0; }

  const cfgPath = o.noConfig ? null : (o.config ?? findConfig());
  let cfg, resolved;
  try {
    cfg = mergeConfig(loadConfig(cfgPath), o);
    const remote = cfg.ruleSets.filter((r) => /^https?:\/\//i.test(r));
    const extraSets = [];
    for (const url of remote) extraSets.push(await fetchSetUrl(url));
    resolved = resolveRules({ ...cfg, extraSets });
  } catch (e) { process.stderr.write(`slop: ${e.message}\n`); return 2; }
  const rules = resolved.rules;

  if (o.cmd === 'list') {
    for (const set of resolved.sets) {
      process.stdout.write(`\n${C.bold(set.name)} ${C.dim('- ' + (set.title || ''))}\n`);
      for (const r of set.rules) {
        const live = rules.find((x) => x.id === r.id);
        // A tuned rule behaves differently here than it does for whoever wrote
        // it, which is worth saying out loud in the listing.
        const tuned = live && live.tuned ? C.yellow(' tuned') : '';
        process.stdout.write(`  ${live ? C.green('on ') : C.dim('off')} ${r.id.padEnd(22)} ${r.name}${tuned}\n`);
      }
    }
    process.stdout.write(`\n${rules.length} of ${resolved.available.length} rules active\n`);
    return 0;
  }

  if (o.cmd === 'explain') {
    const id = o.args[0];
    const r = resolved.available.find((x) => x.id === id);
    if (!r) { process.stderr.write(`slop: no rule "${id}"\n`); return 2; }
    const m = r.match || {};
    const n = r.notable || {};
    const band = ['<', '<=', '>', '>='].filter((op) => n[op] !== undefined)
      .map((op) => `${op} ${n[op]}`).join(' or ');
    const per = n.per ? ` per ${n.per} ${n.unit || 'words'}` : '';
    process.stdout.write(`${C.bold(r.id)}  ${r.name}\n  set:      ${r.set}\n`
      + `  matches:  ${m.kind}\n  notable:  ${band}${per}\n  severity: ${r.severity}\n`);
    if (m.pattern) process.stdout.write(`  pattern:  /${m.pattern}/${m.flags || ''}\n`);
    process.stdout.write(`\n  ${r.description}\n`);
    if (r.suggest) process.stdout.write(`\n  ${C.cyan('fix:')} ${r.suggest}\n`);
    if (r.from) {
      process.stdout.write(`\n  ${C.dim('mined from:')} ${r.from}${r.source ? ` ${C.dim('·')} ${r.source}` : ''}\n`);
    }
    if (r.evidence) process.stdout.write(`\n  ${C.dim('evidence:')} ${r.evidence}\n`);
    if (r.reference) {
      const u = r.reference.unit ? ` (${r.reference.unit})` : '';
      process.stdout.write(`\n  ${C.dim('measured rates' + u + ':')}\n`);
      for (const k of ['human', 'ai', 'tune']) {
        if (r.reference[k]) process.stdout.write(`    ${C.dim(k === 'tune' ? 'tuning' : k)}  ${r.reference[k]}\n`);
      }
    }
    if (r.default === 'off') {
      process.stdout.write(`\n  ${C.dim('off by default:')} ${r.offBecause || 'no reason recorded'}\n`
        + `  ${C.dim('turn it on with:')} --select ${r.id}\n`);
    }
    if (r.measured) process.stdout.write(`\n  ${C.dim('measured:')} ${r.measured}\n`);
    if (r.note) process.stdout.write(`\n  ${C.dim('note:')} ${r.note}\n`);
    const t = r.tests || {};
    if (t.hit?.length) { process.stdout.write(`\n  ${C.yellow('flags:')}\n`); t.hit.forEach((x) => process.stdout.write(`    ${x}\n`)); }
    if (t.miss?.length) { process.stdout.write(`\n  ${C.green('allows:')}\n`); t.miss.forEach((x) => process.stdout.write(`    ${x}\n`)); }
    return 0;
  }

  // ---- rule library ------------------------------------------------------
  const report = (verb, info, extra = '') => {
    const warn = info.newerEngine ? C.yellow(`  built for slop ${info.newerEngine}, this is ${ENGINE_VERSION}`) : '';
    process.stdout.write(`${verb} ${C.bold(info.name)} ${C.dim('v' + info.version)} `
      + `${C.dim(`${info.rules} rules`)}${extra}`
      + (info.failing ? `  ${C.red(info.failing + ' failing')}` : `  ${C.dim('tests pass')}`) + warn + '\n');
  };

  if (o.cmd === 'add') {
    if (!o.args.length) { process.stderr.write('slop: add needs a URL or a path\n'); return 2; }
    let added = 0;
    for (const src of o.args) {
      let fetched;
      try { fetched = await fetchSets(src); }
      catch (e) { process.stderr.write(`slop: ${src}: ${e.message}\n`); return 2; }
      for (const f of fetched) {
        let info;
        try { info = inspect(f.json, f.name); }
        catch (e) { process.stderr.write(`slop: ${f.src}: ${e.message}\n`); return 2; }
        const shadows = fs.existsSync(path.join(BUILTIN, info.name + '.json'));
        if (info.failing && !o.force) {
          process.stdout.write(`${C.red('not added')} ${C.bold(info.name)} ${C.dim('v' + info.version)}  `
            + `${C.red(info.failing + ' failing')} ${C.dim('· run `fudge` on it, or --force to install anyway')}\n`);
          continue;
        }
        install(f.json, info, f.src);
        added++;
        report(C.green(info.failing ? 'added (forced)' : 'added'), info,
               shadows ? C.dim(' (shadows the built-in)') : '');
      }
    }
    if (added) process.stdout.write(C.dim('active now; turn one off with --ignore <name>\n'));
    return added ? 0 : 1;
  }

  if (o.cmd === 'update') {
    const lock = readLock();
    const names = o.args.length ? o.args : Object.keys(lock.sets);
    if (!names.length) { process.stdout.write('nothing installed\n'); return 0; }
    let changed = 0;
    for (const name of names) {
      const rec = lock.sets[name];
      if (!rec) { process.stderr.write(`slop: "${name}" is not installed\n`); return 2; }
      let fetched;
      try { fetched = await fetchSets(rec.source); }
      catch (e) { process.stdout.write(`${C.red('failed')} ${name} ${C.dim(rec.source)}: ${e.message}\n`); continue; }
      const match = fetched.find((f) => (f.json.name || f.name) === name) || fetched[0];
      let info;
      try { info = inspect(match.json, name); }
      catch (e) { process.stdout.write(`${C.red('failed')} ${name}: ${e.message}\n`); continue; }

      // Unchanged means the same rules *and* the same version; a version bump
      // with identical rules is still worth recording.
      if (info.sha256 === rec.sha256 && info.version === rec.version) {
        process.stdout.write(`${C.dim('current')} ${name} ${C.dim('v' + rec.version)}\n`);
        continue;
      }
      const dir = compareVersions(info.version, rec.version);
      const arrow = `${rec.version} → ${info.version}${dir < 0 ? C.yellow(' (older!)') : ''}`;
      // A candidate that fails its own tests is held back unless forced.
      if (info.failing && !o.force) {
        process.stdout.write(`${C.red('held back')} ${name} ${C.dim(arrow)}  `
          + `${C.red(info.failing + ' failing')} ${C.dim('· --force to install anyway')}\n`);
        continue;
      }
      if (o.checkOnly) {
        process.stdout.write(`${C.yellow('update')} ${name} ${C.dim(arrow)}  ${C.dim('tests pass')}\n`);
        continue;
      }
      install(match.json, info, match.src);
      report(C.green(info.failing ? 'updated (forced)' : 'updated'), info, C.dim(`  ${arrow}`));
      changed++;
    }
    if (o.checkOnly) return 0;
    if (!changed) process.stdout.write(C.dim('nothing to do\n'));
    return 0;
  }

  if (o.cmd === 'remove') {
    if (!o.args.length) { process.stderr.write('slop: remove needs a set name\n'); return 2; }
    for (const name of o.args) {
      if (!uninstall(name)) { process.stderr.write(`slop: no installed set "${name}"\n`); return 2; }
      process.stdout.write(`${C.red('removed')} ${name}\n`);
    }
    return 0;
  }

  if (o.cmd === 'restore') {
    const file = o.args[0] || lockPath();
    let lock;
    try { lock = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { process.stderr.write(`slop: cannot read ${file}: ${e.message}\n`); return 2; }
    const entries = Object.entries(lock.sets || {});
    if (!entries.length) { process.stdout.write('nothing to restore\n'); return 0; }
    if (compareVersions(lock.slop, ENGINE_VERSION) > 0) {
      process.stdout.write(C.yellow(`lock written by slop ${lock.slop}, this is ${ENGINE_VERSION}\n`));
    }
    for (const [name, rec] of entries) {
      let fetched;
      try { fetched = await fetchSets(rec.source); }
      catch (e) { process.stdout.write(`${C.red('failed')} ${name} ${C.dim(rec.source)}: ${e.message}\n`); continue; }
      const match = fetched.find((f) => (f.json.name || f.name) === name) || fetched[0];
      const info = inspect(match.json, name);
      const drift = info.sha256 !== rec.sha256
        ? C.yellow(`  differs from the lock (${rec.version} → ${info.version})`) : '';
      if (info.failing && !o.force) {
        process.stdout.write(`${C.red('skipped')} ${name} ${C.dim('v' + info.version)}  `
          + `${C.red(info.failing + ' failing')}${drift} ${C.dim('· --force to install anyway')}\n`);
        continue;
      }
      install(match.json, info, match.src);
      report(C.green(info.failing ? 'restored (forced)' : 'restored'), info, drift);
    }
    return 0;
  }

  if (o.cmd === 'sets') {
    const active = new Set(rules.map((r) => r.id));
    const lock = readLock();
    process.stdout.write(`${pad('SET', 22)}${pad('VERSION', 10)}${'RULES'.padStart(5)}  `
      + `${pad('ACTIVE', 8)}${pad('TESTS', 12)}SOURCE\n`);
    for (const set of resolved.sets) {
      const rec = lock.sets[set.name];
      const on = set.rules.filter((r) => active.has(r.id)).length;
      const t = testRules(set.rules, { md: extractMarkdown, html: extractHtml });
      const bad = t.conform.fail + t.fudge.fail;
      const state = on === set.rules.length ? C.green('all') : on ? C.yellow(`${on}/${set.rules.length}`) : C.dim('off');
      const tests = bad ? C.red(`${bad} failing`) : C.green('pass');
      const from = rec ? rec.source : C.dim('built-in');
      const note = set.shadows ? C.dim(' (shadows built-in)') : '';
      process.stdout.write(`${pad(set.name, 22)}${pad(C.dim('v' + (set.version || '0.0.0')), 10)}`
        + `${String(set.rules.length).padStart(5)}  ${pad(state, 8)}${pad(tests, 12)}${from}${note}\n`);
    }
    process.stdout.write(`\n${C.dim(`library: ${path.relative(process.cwd(), libraryDir()) || '.'}/`)}`
      + `  ${C.dim(`lock: ${path.relative(process.cwd(), lockPath())}`)}`
      + `  ${C.dim(`engine: slop ${ENGINE_VERSION}`)}\n`);
    return 0;
  }

  if (o.cmd === 'test-rules' || o.cmd === 'fudge') {
    const mod = await import(pathToFileURL(path.join(import.meta.dirname, '..', 'tests', 'run.mjs')).href);
    return mod.default(o.args);
  }

  const targets = o.args.length ? o.args : ['-'];
  const files = [];
  for (const t of targets) {
    if (t === '-' || isUrl(t)) { files.push(t); continue; }
    let st;
    try { st = fs.statSync(t); } catch { process.stderr.write(`slop: no such file: ${t}\n`); return 2; }
    if (st.isDirectory()) {
      if (!o.recursive && targets.length === 1 && t === '.') walk(t, files, cfg.exclude);
      else if (!o.recursive) { process.stderr.write(`slop: ${t} is a directory (use -r)\n`); return 2; }
      else walk(t, files, cfg.exclude);
    } else files.push(t);
  }

  const reports = [];
  for (const f of files) {
    try {
      const { name, src, kind } = await readSource(f);
      reports.push(lintSource(name, src, kind, rules,
        { ...o, indentCode: cfg.indentCode, skipTables: cfg.skipTables }));
    } catch (e) { process.stderr.write(`slop: cannot read ${f}: ${e.message}\n`); return 2; }
  }

  const all = reports.flatMap((r) => r.findings);
  const words = reports.reduce((a, r) => a + r.words, 0);
  const per1000 = words ? +(all.length / words * 1000).toFixed(2) : 0;

  // --share turns a local file into a link that opens the same text, the same
  // rule sets and the same findings in the web viewer. The document travels in
  // the URL fragment, which browsers never send to a server.
  if (o.share) {
    const kindOf = (f) => /\.html?$/i.test(f) ? 'html' : /\.(md|markdown|mdx)$/i.test(f) ? 'md' : 'txt';
    const p = new URLSearchParams();
    if (files.length === 1 && isUrl(files[0])) {
      p.set('url', files[0]);
    } else if (files.length === 1) {
      const f = files[0];
      p.set('gz', zlib.gzipSync(fs.readFileSync(f === '-' ? 0 : f)).toString('base64url'));
      p.set('kind', f === '-' ? 'md' : kindOf(f));
      if (f !== '-') p.set('name', path.basename(f));
    } else {
      // A directory becomes one link carrying every file, so the page can show
      // the tree rather than the reader juggling a link per file.
      const bundle = files.map((f) => ({
        name: path.relative(process.cwd(), f) || path.basename(f),
        kind: kindOf(f),
        src: fs.readFileSync(f, 'utf8')
      }));
      p.set('bundle', zlib.gzipSync(Buffer.from(JSON.stringify(bundle), 'utf8')).toString('base64url'));
    }
    if (cfg.select.length) p.set('select', cfg.select.join(','));
    if (cfg.ignore.length) p.set('ignore', cfg.ignore.join(','));
    for (const r of cfg.ruleSets) if (/^https?:\/\//i.test(r)) p.append('rules', r);
    const link = o.shareBase.replace(/\/?$/, '/') + '#' + p.toString();
    process.stdout.write(link + '\n');
    if (link.length > 60000) {
      process.stderr.write(`slop: that link is ${Math.round(link.length / 1000)}k characters. `
        + `some tools truncate long URLs. Share fewer files, or send the JSON from --format json.\n`);
    }
    return 0;
  }

  if (o.format === 'json') {
    process.stdout.write(JSON.stringify({
      files: reports, total: all.length, words, per1000,
      rules: rules.map((r) => r.id), config: cfgPath || null
    }, null, 2) + '\n');
  } else if (o.format === 'tsv') {
    for (const f of all) process.stdout.write([f.file, f.line, f.col, f.rule, oneLine(f.match, 200)].join('\t') + '\n');
  } else if (o.format === 'github') {
    for (const f of all) process.stdout.write(`::warning file=${f.file},line=${f.line},col=${f.col},title=${f.rule}::${oneLine(f.match + ' · ' + (f.suggest || ''), 200).replace(/[\r\n%]/g, ' ')}\n`);
  } else {
    for (const r of reports) {
      if (!r.findings.length || o.quiet) continue;
      process.stdout.write(`\n${C.bold(r.file)} ${C.dim(`(${r.words} words, ${r.findings.length} findings)`)}\n`);
      for (const f of r.findings) {
        const badge = f.count ? C.dim(` ×${f.count}`) : '';
        if (f.docLevel) {
          // The rate, then the occurrences behind it. There is no single
          // offending span, so the rule name takes the line:col column.
          process.stdout.write(`  ${C.cyan('document '.padEnd(9))} ${C.yellow(f.rule.padEnd(21))} ${oneLine(f.measure || f.name, 88)}\n`);
          const show = o.context ? f.occurrences : f.occurrences.slice(0, 5);
          for (const oc of show) {
            process.stdout.write(`  ${C.dim(`${oc.line}:${oc.col}`.padStart(9))} ${C.dim(oneLine(oc.context || oc.match, 96))}\n`);
          }
          if (f.occurrences.length > show.length) {
            process.stdout.write(`  ${' '.repeat(9)} ${C.dim(`… ${f.occurrences.length - show.length} more (--context for all)`)}\n`);
          }
        } else {
          process.stdout.write(`  ${C.cyan(`${f.line}:${f.col}`.padEnd(9))} ${C.yellow(f.rule.padEnd(21))}${badge} ${oneLine(f.match, 88)}\n`);
          if (o.context && f.sentence.trim() !== f.match.trim()) {
            process.stdout.write(`  ${' '.repeat(9)} ${C.dim(oneLine(f.sentence, 132))}\n`);
          }
        }
        if (o.suggest && f.suggest) process.stdout.write(`  ${' '.repeat(9)} ${C.dim('fix: ' + f.suggest)}\n`);
      }
    }
    const by = new Map();
    for (const f of all) by.set(f.rule, (by.get(f.rule) || 0) + 1);
    if (by.size && !o.quiet) {
      process.stdout.write(`\n${C.bold('By rule')}\n`);
      for (const [id, n] of [...by].sort((a, b) => b[1] - a[1])) process.stdout.write(`  ${String(n).padStart(4)}  ${id}\n`);
    }
    const head = all.length ? C.red(`${all.length} findings`) : C.green('0 findings');
    process.stdout.write(`\n${head} in ${reports.length} file${reports.length === 1 ? '' : 's'}, ${words} words, ${per1000} per 1000 words\n`);
  }

  // Findings are style smells, not errors, so they do not fail a run on their
  // own. Opt in with --max or --max-per-1000 when you want CI to gate on them.
  if (o.exitZero) return 0;
  if (cfg.maxPer1000 != null) return per1000 > cfg.maxPer1000 ? 1 : 0;
  if (cfg.max != null) return all.length > cfg.max ? 1 : 0;
  return 0;
}

main().then((c) => { process.exitCode = c; }, (e) => {
  process.stderr.write(`slop: ${e.stack || e.message}\n`); process.exitCode = 2;
});
