#!/usr/bin/env node
// Smoke test for the page itself.
//
// The rule tests never load index.html, so a load-time ReferenceError there is
// invisible to them — which is exactly how a refactor once deleted the file
// loaders and broke drag-and-drop without a single test failing.
//
// Serves the repo, drives headless Chrome over CDP, and fails on any uncaught
// exception plus a handful of interactions that must work.
//
//   node tests/web.mjs            uses google-chrome
//   CHROME=/path/to/chrome node tests/web.mjs
//
// Exits 0 and prints "skipped" when no Chrome is available, so `npm test`
// still works on a machine without one.

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript',
                '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

function findChrome() {
  const env = process.env.CHROME;
  if (env && fs.existsSync(env)) return env;
  for (const c of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const r = spawnSync('which', [c], { encoding: 'utf8' });
    if (r.status === 0) return r.stdout.trim();
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // WebSocket became a global in Node 22; the CDP connection needs it.
  if (typeof WebSocket === 'undefined') {
    console.log(`web smoke test: skipped (Node ${process.versions.node} has no global WebSocket; needs 22+)`);
    return 0;
  }
  const chrome = findChrome();
  if (!chrome) {
    console.log('web smoke test: skipped (no Chrome found; set CHROME=/path/to/chrome)');
    return 0;
  }

  const server = createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    let file = path.join(ROOT, rel);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/web/`;

  const port = 9200 + (process.pid % 500);
  const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    `--remote-debugging-port=${port}`, '--window-size=1400,900', 'about:blank'], { stdio: 'ignore' });

  let ws, fail = (m) => { throw new Error(m); };
  try {
    let target = null;
    for (let i = 0; i < 60 && !target; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        target = list.find((t) => t.type === 'page');
      } catch { /* not up yet */ }
      if (!target) await sleep(200);
    }
    if (!target) fail('chrome did not start');

    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
    let id = 0;
    const pending = new Map();
    const errors = [];
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
      if (m.method === 'Runtime.exceptionThrown') {
        errors.push(m.params.exceptionDetails.exception?.description
          || m.params.exceptionDetails.text || 'exception');
      }
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
        errors.push(`${m.params.entry.text} <- ${m.params.entry.url || '?'}`);
      }
    });
    const send = (method, params = {}) =>
      new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
      return r.result?.result?.value;
    };

    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: base });
    await sleep(3500);

    const checks = [];
    const check = (name, ok, detail = '') => checks.push({ name, ok, detail });

    check('page loads with no uncaught exception', errors.length === 0, errors.slice(0, 2).join(' | '));

    const wiring = await evaluate(`JSON.stringify({
      ids: ['input','doc','list','tree','panes','rules','b-copy','n-next','divider']
             .filter(i => !document.getElementById(i)),
      sets: document.querySelectorAll('.rset').length,
      copyButtons: document.querySelectorAll('.copy-pre').length
    })`);
    const w = JSON.parse(wiring);
    check('every element the script wires up exists', w.ids.length === 0, w.ids.join(','));
    check('rule sets rendered', w.sets >= 2, String(w.sets));
    check('code blocks have copy buttons', w.copyButtons >= 4, String(w.copyButtons));

    const example = await evaluate(`(async()=>{document.getElementById('b-example').click();
      await new Promise(r=>setTimeout(r,1500));
      return JSON.stringify({n:document.querySelectorAll('#list li[data-i]').length,
        marks:document.querySelectorAll('#doc mark').length})})()`);
    const ex = JSON.parse(example);
    check('the example lints', ex.n > 0 && ex.marks > 0, JSON.stringify(ex));

    const dropped = await evaluate(`(async()=>{
      const dt = new DataTransfer();
      dt.items.add(new File(['# T\\n\\nIt is important to note that x. No a, no b, no c.\\n'], 'drop.md'));
      dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true}));
      await new Promise(r=>setTimeout(r,1600));
      return JSON.stringify({loaded: document.getElementById('input').value.startsWith('# T'),
        n: document.querySelectorAll('#list li[data-i]').length})})()`);
    const d = JSON.parse(dropped);
    check('dropping a file loads and lints it', d.loaded && d.n > 0, JSON.stringify(d));

    const many = await evaluate(`(async()=>{
      const dt = new DataTransfer();
      dt.items.add(new File(['It is important to note that a.\\n'], 'a.md'));
      dt.items.add(new File(['No x, no y, no z.\\n'], 'b.md'));
      dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true}));
      await new Promise(r=>setTimeout(r,1600));
      return JSON.stringify({files: document.querySelectorAll('#tree button.f').length,
        tree: !document.getElementById('tree').hidden})})()`);
    const mn = JSON.parse(many);
    check('dropping several files builds a tree', mn.files === 2 && mn.tree, JSON.stringify(mn));

    const fudge = await evaluate(`(async()=>{document.getElementById('m-fudge').click();
      await new Promise(r=>setTimeout(r,9000));
      return JSON.stringify({rows: document.querySelectorAll('.frow').length,
        score: document.getElementById('score').textContent})})()`);
    const fg = JSON.parse(fudge);
    check('test-rules mode runs', fg.rows > 10 && /failing/.test(fg.score), JSON.stringify(fg));

    check('no exception during interaction', errors.length === 0, errors.slice(0, 2).join(' | '));

    const bad = checks.filter((c) => !c.ok);
    for (const c of checks) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.name}${c.ok ? '' : '  — ' + c.detail}`);
    console.log(`web smoke test: ${checks.length - bad.length} passed, ${bad.length} failed`);
    return bad.length ? 1 : 0;
  } finally {
    try { ws?.close(); } catch {}
    proc.kill();
    server.close();
  }
}

main().then((c) => process.exit(c), (e) => { console.error('web smoke test:', e.message); process.exit(1); });
