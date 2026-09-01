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
    // A cold CI runner can take a while to bring Chrome up, and 12 seconds was
    // not always enough. Wait a minute, and say what went wrong if it never came.
    let target = null;
    let lastErr = null;
    for (let i = 0; i < 300 && !target; i++) {
      if (proc.exitCode !== null) fail(`chrome exited with code ${proc.exitCode} before listening`);
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        target = list.find((t) => t.type === 'page');
      } catch (e) { lastErr = e.message; }
      if (!target) await sleep(200);
    }
    if (!target) fail(`chrome did not start within 60s on port ${port}${lastErr ? ` (${lastErr})` : ''}`);

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
      if (r.result?.exceptionDetails) {
        const d = r.result.exceptionDetails;
        throw new Error((d.exception?.description || d.text || 'page threw')
          + `\n    while evaluating: ${expression.replace(/\s+/g, ' ').slice(0, 120)}`);
      }
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

    // What ships runs; what is a candidate is loaded but unchecked. Getting
    // this backwards would silently change what every visitor's text is judged by.
    const defaults = await evaluate(`(()=>{
      const boxes=[...document.querySelectorAll('#rules input[data-toggle]')];
      // Fully checked, not merely partly. The measured-* sets are views over the
      // same rule ids as their sources, so they read as indeterminate whenever a
      // source set is on. That is accurate: those rules really are running.
      const on=boxes.filter(b=>b.checked&&!b.indeterminate).map(b=>b.dataset.toggle).sort();
      return JSON.stringify({total:boxes.length, on});
    })()`);
    const D = JSON.parse(defaults.replace(/^"|"$/g, '').replace(/\\"/g, '"'));
    check('every set has a set-level toggle', D.total >= 8, String(D.total));
    // simonwillison and wikipedia-ai run whole. mined ships on but holds rules
    // that are off, so it reads as partly on rather than fully checked.
    check('shipped sets run, candidate sets do not',
      JSON.stringify(D.on) === JSON.stringify(['simonwillison', 'wikipedia-ai']),
      D.on.join(','));

    // mined ships on with a subset of its rules off, so the house-style em-dash
    // rule has to be running while its set reads as only partly enabled.
    const optin = await evaluate(`(()=>{
      const box=document.querySelector('#rules input[data-rule="em-dash"]');
      const set=document.querySelector('#rules input[data-toggle="mined"]');
      return JSON.stringify({rule: box ? box.checked : null,
        setFullyOn: set ? set.checked && !set.indeterminate : null})})()`);
    const oi = JSON.parse(optin);
    check('a set can run with only some of its rules on',
      oi.rule === true && oi.setFullyOn === false, JSON.stringify(oi));
    check('code blocks have copy buttons', w.copyButtons >= 4, String(w.copyButtons));

    const example = await evaluate(`(async()=>{document.getElementById('b-example').click();
      await new Promise(r=>setTimeout(r,1500));
      return JSON.stringify({n:document.querySelectorAll('#list li[data-i]').length,
        marks:document.querySelectorAll('#doc mark').length})})()`);
    const ex = JSON.parse(example);
    // The badge counts the rule's own unit, which differs per rule, so it has
    // to say which rather than showing a bare multiplier.
    const badges = await evaluate(`(()=>JSON.stringify(
      [...document.querySelectorAll('#list .cnt')].map(n=>({b:n.textContent,t:n.title}))))()`);
    const bd = JSON.parse(badges);
    check('a count badge says what it counts',
      bd.length >= 2 && bd.every(x => x.t && x.t.length > 5), JSON.stringify(bd));

    check('the example lints', ex.n > 0 && ex.marks > 0, JSON.stringify(ex));

    // A doc-level finding measures the document rather than quoting a phrase.
    // It used to dump its whole measure string into the slot styled for a
    // quoted phrase, and its occurrences were never painted at all.
    const rate = await evaluate(`(async()=>{
      const t=document.getElementById('input');
      t.value=${JSON.stringify(('The rollout went ahead: the team shipped it. ' +
        'We chose the staged path rather than the big-bang one. ' +
        'The cache warmed first: the reads followed. ' +
        'They picked latency rather than throughput. ' +
        'The queue drained slowly: the workers kept up. ' +
        'It was measured rather than guessed. ').repeat(12))};
      t.dispatchEvent(new Event('input'));
      await new Promise(r=>setTimeout(r,2000));
      // A scarcity rule reports an absence and so has no occurrences to paint.
      // Pick a rate that counted something.
      const li=[...document.querySelectorAll('#list li.doclevel')]
        .find(n=>!/^0 occurrences/.test((n.querySelector('.rsub')||{}).textContent||''));
      if(!li) return JSON.stringify({rows:document.querySelectorAll('#list li[data-i]').length});
      li.click();
      await new Promise(r=>setTimeout(r,400));
      return JSON.stringify({
        value: (li.querySelector('.rate b')||{}).textContent,
        unit: (li.querySelector('.rate .ru')||{}).textContent,
        bound: (li.querySelector('.rate .rb')||{}).textContent,
        boundTitle: (li.querySelector('.rate .rb')||{}).title,
        sub: (li.querySelector('.rsub')||{}).textContent,
        marks: document.querySelectorAll('#doc mark.rate').length,
        lit: document.querySelectorAll('#doc mark.on').length})})()`);
    const rt = JSON.parse(rate);
    check('a rate shows its value, unit and the bound it crossed',
      Number(rt.value) > 0 && /per \d+ words/.test(rt.unit || '')
      && /[\u2265\u2264<>]\s?\d/.test(rt.bound || '') && (rt.boundTitle || '').length > 10,
      JSON.stringify(rt));
    check('a rate says what it counted',
      /\d+ occurrences? in \d+ words/.test(rt.sub || ''), JSON.stringify(rt));
    check('the occurrences behind a rate are painted and light up together',
      rt.marks > 1 && rt.lit > 1, JSON.stringify(rt));

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

    // The page prefills its own rule set, one rule of which fails on purpose,
    // so the mode demonstrates what a failure looks like without being loaded.
    const fudge = await evaluate(`(async()=>{document.getElementById('m-fudge').click();
      await new Promise(r=>setTimeout(r,4000));
      return JSON.stringify({rows: document.querySelectorAll('#list li[data-rule]').length,
        score: document.getElementById('score').textContent,
        prefilled: document.getElementById('rules-src').value.length,
        why: document.querySelectorAll('#list .why').length})})()`);
    const fg = JSON.parse(fudge);
    check('test-rules mode tests the template', fg.rows >= 2 && fg.prefilled > 200, JSON.stringify(fg));
    check('the template shows a real failure', /1 failing/.test(fg.score) && fg.why >= 1, JSON.stringify(fg));

    // A failure says what that kind of failure generally means, the way a
    // finding says how to fix the phrase it flagged.
    const help = await evaluate(`(()=>{
      const f=document.querySelector('#list li.bad .fix');
      return JSON.stringify({text: f ? f.textContent : null})})()`);
    const hp = JSON.parse(help);
    check('a failure explains what that kind of failure means',
      hp.text && /word boundary/.test(hp.text), JSON.stringify(hp));

    // A rule that passes must carry nothing that reads as a complaint.
    const pass = await evaluate(`(()=>{
      const li=[...document.querySelectorAll('#list li[data-rule]')].find(x=>!x.classList.contains('bad'));
      return JSON.stringify({rule: li && li.dataset.rule,
        why: li ? li.querySelectorAll('.why,.fix').length : -1,
        text: li ? li.textContent.replace(/\\s+/g,' ').trim() : null})})()`);
    const ps = JSON.parse(pass);
    check('a passing rule shows no failure text', ps.why === 0 && !/Write/.test(ps.text || ''), JSON.stringify(ps));

    // The list reads down in the same order as the rule set, so a row lines up
    // with the rule above it in the editor rather than being sorted away from it.
    const order = await evaluate(`(()=>{
      const ids=[...document.querySelectorAll('#list li[data-rule]')].map(li=>li.dataset.rule);
      const src=JSON.parse(document.getElementById('rules-src').value).rules.map(r=>r.id);
      return JSON.stringify({ids, src, marks:[...document.querySelectorAll('#list li .loc')].map(n=>n.textContent)})})()`);
    const od = JSON.parse(order);
    check('results follow the order of the rule set',
      JSON.stringify(od.ids) === JSON.stringify(od.src), JSON.stringify(od));
    check('pass and fail are marked differently',
      od.marks.includes('\u2713') && od.marks.includes('\u2715'), JSON.stringify(od.marks));

    // The two phases have independent totals, so only the one that failed is
    // marked; a single failure count spanning both would be unreadable.
    const counts = await evaluate(`(()=>{
      const li=document.querySelector('#list li.bad');
      return JSON.stringify({text: li.querySelector('.counts').textContent,
        red: [...li.querySelectorAll('.counts .x')].map(n=>n.textContent)})})()`);
    const ct = JSON.parse(counts);
    check('each test phase reports its own total',
      /1 of 2 examples/.test(ct.text) && /22 of 22 markup variants/.test(ct.text)
      && ct.red.length === 1 && /examples/.test(ct.red[0]), JSON.stringify(ct));

    // A failure points back at the exact string in the editor that caused it.
    const link = await evaluate(`(async()=>{
      const why=document.querySelector('#list li.bad .why');
      why.click();
      await new Promise(r=>setTimeout(r,200));
      const ta=document.getElementById('rules-src');
      return JSON.stringify({picked: ta.value.slice(ta.selectionStart, ta.selectionEnd)})})()`);
    const lk = JSON.parse(link);
    check('clicking a failure selects the example in the editor',
      lk.picked === 'Every request is logged to disk.', JSON.stringify(lk));

    const rowLink = await evaluate(`(async()=>{
      const row=document.querySelector('#list li.bad');
      row.click();
      await new Promise(r=>setTimeout(r,200));
      const ta=document.getElementById('rules-src');
      const sel=ta.value.slice(ta.selectionStart, ta.selectionEnd);
      return JSON.stringify({starts: sel.slice(0,1), hasId: /"id":\\s*"very"/.test(sel), len: sel.length})})()`);
    const rl = JSON.parse(rowLink);
    check('clicking a rule selects that whole rule',
      rl.starts === '{' && rl.hasId && rl.len > 100, JSON.stringify(rl));

    // Malformed JSON names the line and puts the cursor on it.
    const broken = await evaluate(`(async()=>{
      const t=document.getElementById('rules-src');
      t.value='{\\n  "name": "x",\\n  "rules": [\\n    { "id": "a", }\\n  ]\\n}';
      t.dispatchEvent(new Event('input'));
      await new Promise(r=>setTimeout(r,900));
      const e=document.getElementById('rerr');
      e.click();
      const before=t.value.slice(0,t.selectionStart);
      return JSON.stringify({shown:!e.hidden, msg:e.textContent, line:before.split('\\n').length})})()`);
    const bk = JSON.parse(broken);
    check('bad JSON names the line and the usual causes',
      bk.shown && /Line 4/.test(bk.msg) && /trailing comma/.test(bk.msg), JSON.stringify(bk));
    check('clicking the JSON error jumps to it', bk.line === 4, JSON.stringify(bk));

    // Two rules cannot answer to one id: it decides selection, ignoring and
    // reporting, so a duplicate fails quietly rather than loudly.
    const dup = await evaluate(`(async()=>{
      const t=document.getElementById('rules-src');
      t.value=JSON.stringify({name:'dup',rules:[1,2,3].map(()=>({id:'a',kind:'regex',
        match:{kind:'regex',pattern:'foo',flags:'gi'},notable:{'>':0},
        description:'d',suggest:'s',tests:{hit:['a foo b'],miss:['bar']}}))});
      t.dispatchEvent(new Event('input'));
      await new Promise(r=>setTimeout(r,1200));
      const e=document.getElementById('rerr');
      return JSON.stringify({shown:!e.hidden, msg:e.textContent,
        head:document.getElementById('list-head').textContent,
        rows:document.querySelectorAll('#list li[data-rule]').length})})()`);
    const dp = JSON.parse(dup);
    check('duplicate rule ids are refused with a reason',
      dp.shown && /appears 3 times/.test(dp.msg) && dp.rows === 0 && dp.head === 'not run',
      JSON.stringify(dp));

    // Replacing the text re-runs against whatever is there now.
    const own = await evaluate(`(async()=>{
      const t=document.getElementById('rules-src');
      t.value=JSON.stringify({name:'t',rules:[{id:'x',name:'x',
        match:{kind:'regex',pattern:'\\\\bfoo\\\\b',flags:'gi'}, notable:{'>':0},
        description:'d',suggest:'s',tests:{hit:['a foo b'],miss:['football']}}]});
      t.dispatchEvent(new Event('input'));
      await new Promise(r=>setTimeout(r,3000));
      return JSON.stringify({score: document.getElementById('score').textContent,
        rows: document.querySelectorAll('#list li[data-rule]').length})})()`);
    const ow = JSON.parse(own);
    check('editing the rules re-runs the tests', /0 failing/.test(ow.score), JSON.stringify(ow));

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
