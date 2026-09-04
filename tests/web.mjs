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
// A stylesheet served without text/css is refused by the browser, so the pages
// rendered unstyled here and every geometry check measured the wrong thing.
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript',
                '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
                '.svg': 'image/svg+xml' };

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
        // One test asks for a URL that is not there, on purpose, to prove the
        // page says so. Its 404 is the expected result, not a fault.
        if (!/definitely-not-here/.test(m.params.entry.url || '')) {
          errors.push(`${m.params.entry.text} <- ${m.params.entry.url || '?'}`);
        }
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
    await sleep(1200);

    // The rule list is painted after five rule sets are fetched, so a fixed
    // sleep is a race that fails under load. Wait for the thing instead: this
    // went red twice on a loaded machine, both times reported as a null
    // checkbox rather than as the timing problem it was.
    const waitFor = async (selector, ms = 15000) => {
      const until = Date.now() + ms;
      while (Date.now() < until) {
        const got = await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
        if (got === 'true' || got === true) return true;
        await sleep(150);
      }
      throw new Error(`timed out waiting for ${selector}`);
    };
    await waitFor('#rules input[data-rule="em-dash"]');

    const checks = [];
    const check = (name, ok, detail = '') => checks.push({ name, ok, detail });

    check('page loads with no uncaught exception', errors.length === 0, errors.slice(0, 2).join(' | '));

    const wiring = await evaluate(`JSON.stringify({
      ids: ['input','doc','list','rules','b-copy','n-next','tally','pane-rules','pane-list']
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
    check('every set has a set-level toggle', D.total >= 5, String(D.total));
    // Only what ships is offered. candidates/ is repository furniture: style
    // profiles, and a record of patterns that measured backwards. A visitor has
    // no way to tell those apart from a rule that earned its place.
    check('every offered set runs, and nothing else is offered',
      JSON.stringify([...D.on].sort()) === JSON.stringify(['ai-tells', 'load-bearing',
                                                'pr-vocabulary', 'simonwillison', 'wikipedia-ai']),
      D.on.join(','));
    // Two vocabulary rules ship on and they overlap by about a third of their
    // words, so a reader has to be able to see and separate them.
    const offered = await evaluate(`JSON.stringify([...document.querySelectorAll('#rules input[data-toggle]')]
      .map(b => b.dataset.toggle).sort())`);
    const all = JSON.parse(offered.replace(/^"|"$/g, '').replace(/\\"/g, '"'));
    check('both vocabulary sets are listed separately',
      all.includes('pr-vocabulary') && all.includes('load-bearing'), all.join(','));

    // The panel says what is on. It must not argue about why.
    const noArgument = await evaluate(`JSON.stringify({
      notes: document.querySelectorAll('.setnote').length,
      tips: document.querySelectorAll('.tip-off').length,
      offTags: document.querySelectorAll('.offtag').length
    })`);
    const NA = JSON.parse(noArgument);
    check('the rules panel states defaults without justifying them',
      NA.notes === 0 && NA.tips === 0, JSON.stringify(NA));

    // Partly on is a third state. Turning one rule off has to leave the set
    // running and show it as neither fully on nor off.
    const optin = await evaluate(`(async()=>{
      const box=document.querySelector('#rules input[data-rule="em-dash"]');
      const set=()=>document.querySelector('#rules input[data-toggle="ai-tells"]');
      const before={rule:box.checked, full:set().checked && !set().indeterminate};
      box.click(); await new Promise(r=>setTimeout(r,600));
      const off={rule:document.querySelector('#rules input[data-rule="em-dash"]').checked,
                 partly:set().indeterminate};
      document.querySelector('#rules input[data-rule="em-dash"]').click();
      await new Promise(r=>setTimeout(r,600));
      const back={full:set().checked && !set().indeterminate};
      return JSON.stringify({before, off, back})})()`);
    const oi = JSON.parse(optin);
    check('a set can run with only some of its rules on',
      oi.before.rule === true && oi.before.full === true
      && oi.off.rule === false && oi.off.partly === true && oi.back.full === true,
      JSON.stringify(oi));
    // The install and command-line notes used to sit in an accordion below the
    // tool, with copy buttons on their code blocks. The grid has no room for a
    // document underneath it, so they live in the README the page links to.
    check('the page links out to the source and rule format',
      w.copyButtons === 0, `${w.copyButtons} copy buttons, expected none`);

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
        marks: document.querySelectorAll('#doc mark.occ').length,
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

    // The hover card is a second render path and kept the raw measure string
    // long after the row stopped using it.
    const tip = await evaluate(`(async()=>{
      const out={};
      for (const [k,sel] of [['row','#list li.doclevel'],['mark','#doc mark.occ']]) {
        document.querySelector(sel).dispatchEvent(new MouseEvent('mouseenter',{bubbles:false}));
        await new Promise(r=>setTimeout(r,300));
        const t=document.getElementById('tip');
        out[k]={val:(t.querySelector('.rate b')||{}).textContent,
                sub:(t.querySelector('.rsub')||{}).textContent,
                raw:!!t.querySelector('.tip-count')};
      }
      return JSON.stringify(out)})()`);
    const tp = JSON.parse(tip);
    check('hovering a rate shows it laid out, not as a measure string',
      // 0 is a real value here: a scarcity rule reports an absence.
      ['row','mark'].every(k => tp[k].val && Number.isFinite(Number(tp[k].val))
        && /\d+ occurrences? in \d+ words/.test(tp[k].sub || '') && !tp[k].raw),
      JSON.stringify(tp));

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
      // Long enough to overflow the pane: the point of the test is what happens
      // when you read down through more than fits on a screen.
      const body = (n) => ('# File ' + n + '\\n\\n')
        + ('It is important to note that the ingest path quietly carried a load-bearing '
         + 'assumption nobody had plainly written down. No flags, no metrics, no alerting.\\n\\n').repeat(14);
      dt.items.add(new File([body('a')], 'a.md'));
      dt.items.add(new File([body('b')], 'b.md'));
      dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true}));
      await new Promise(r=>setTimeout(r,1600));
      const tree = document.getElementById('tree');
      const surface = document.querySelector('#pane-doc .surface');
      return JSON.stringify({files: document.querySelectorAll('#tree button.f').length,
        tree: !tree.hidden,
        // The list of files belongs to the pane showing the files. It used to
        // be dropped into the standing prose in the top-left panel.
        inPane: !!tree.closest('#pane-doc'), inSay: !!tree.closest('.say'),
        // Every document is laid out one after another in one scroller, so
        // reading down carries you into the next file.
        sections: document.querySelectorAll('#doc .filesec').length,
        scrolls: surface.scrollHeight > surface.clientHeight + 4})})()`);
    const mn = JSON.parse(many);
    check('several files list themselves beside the text, not in the prose',
      mn.files === 2 && mn.tree && mn.inPane && !mn.inSay, JSON.stringify(mn));
    check('and are laid end to end in one scroller',
      mn.sections === 2 && mn.scrolls, JSON.stringify(mn));

    // Reading into the second file moves the marker and the findings with it.
    const followed = await evaluate(`(async () => {
      const surface = document.querySelector('#pane-doc .surface');
      const secs = [...document.querySelectorAll('#doc .filesec')];
      surface.scrollTop += secs[1].getBoundingClientRect().top
                         - surface.getBoundingClientRect().top - 10;
      surface.dispatchEvent(new Event('scroll', {bubbles: true}));
      await new Promise(r => setTimeout(r, 700));
      const cur = document.querySelector('#tree button.f[aria-current=true]');
      const list = document.getElementById('list');
      const grp = list.querySelector('li.fgroup[data-doc="1"]');
      return JSON.stringify({
        marked: cur ? cur.dataset.i : null,
        // The second file's findings sit at the top of the list, not below a
        // screenful of the first file's.
        groupOffset: grp ? Math.round(grp.getBoundingClientRect().top
                                    - list.getBoundingClientRect().top) : null });
    })()`);
    const FW = JSON.parse(followed);
    check('reading into the next file carries the marker and the findings',
      FW.marked === '1' && FW.groupOffset !== null && Math.abs(FW.groupOffset) < 8,
      JSON.stringify(FW));

    // One document needs no list of documents.
    const single = await evaluate(`(async () => {
      const dt = new DataTransfer();
      dt.items.add(new File(['It is important to note that a. No x, no y, no z.\\n'], 'solo.md'));
      dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true}));
      await new Promise(r => setTimeout(r, 1600));
      return JSON.stringify({hidden: document.getElementById('tree').hidden,
        sections: document.querySelectorAll('#doc .filesec').length});
    })()`);
    const SG = JSON.parse(single);
    check('one file shows no list of files', SG.hidden === true, JSON.stringify(SG));

    // Loading the example replaces whatever is open. It used to write straight
    // into the textarea, which is only the source of truth while at most one
    // file is loaded, so with a folder open the button did nothing at all.
    const replace = await evaluate(`(async () => {
      const dt = new DataTransfer();
      const body = (n) => '# File ' + n + '\\n\\nIt is important to note that a. No x, no y, no z.\\n';
      for (const n of ['p', 'q', 'r']) dt.items.add(new File([body(n)], n + '.md'));
      dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true}));
      await new Promise(r => setTimeout(r, 1800));
      const loaded = document.querySelectorAll('#tree button.f').length;
      document.getElementById('b-example').click();
      await new Promise(r => setTimeout(r, 2200));
      return JSON.stringify({ loaded,
        listed: document.querySelectorAll('#tree button.f').length,
        tree: !document.getElementById('tree').hidden,
        sections: document.querySelectorAll('#doc .filesec').length,
        shows: document.getElementById('doc').innerText.slice(0, 40) });
    })()`);
    const SWAP = JSON.parse(replace);
    check('the example replaces a whole folder, not just a single file',
      SWAP.loaded === 3 && SWAP.listed === 0 && SWAP.tree === false
      && SWAP.sections <= 1 && /retry loop/.test(SWAP.shows), JSON.stringify(SWAP));

    // Testing rules is its own page now, not a mode of this one. It prefills a
    // rule set with one rule that fails on purpose, so it shows what a failure
    // looks like without anything being loaded.
    await send('Page.navigate', { url: base + 'rules.html' });
    await sleep(4500);
    const fudge = await evaluate(`JSON.stringify({
      rows: document.querySelectorAll('#list li[data-rule]').length,
      score: document.getElementById('score').textContent,
      prefilled: document.getElementById('rules-src').value.length,
      why: document.querySelectorAll('#list .why').length,
      page: document.body.dataset.page,
      noInput: !document.getElementById('input')})`);
    const fg = JSON.parse(fudge);
    check('the rules page is its own page and tests the template',
      fg.rows >= 2 && fg.prefilled > 200 && fg.page === 'rules' && fg.noInput, JSON.stringify(fg));
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

    // The bug this catches shipped: the surface was moved inside a block that
    // stays hidden until there are findings, so there was nothing to type into
    // and therefore never any findings. Setting .value from a test does not
    // notice, because it never has to see the thing.
    await send('Page.navigate', { url: base });
    await sleep(2500);
    const empty = await evaluate(`(() => {
      const t = document.getElementById('input');
      const r = t.getBoundingClientRect();
      return JSON.stringify({ visible: r.width > 100 && r.height > 40,
                              onScreen: r.top < innerHeight && r.bottom > 0,
                              placeholder: !!t.placeholder,
                              w: Math.round(r.width), h: Math.round(r.height) });
    })()`);
    const E = JSON.parse(empty);
    check('with nothing typed yet, there is somewhere to type',
      E.visible && E.onScreen && E.placeholder, JSON.stringify(E));

    // The text you paste and the findings on it are one surface now, not two.
    // The overlay technique is easy to get subtly wrong: the caret has to land
    // where you click, the marks have to sit on the words they belong to, and
    // the two layers have to scroll together.
    // A fresh load: earlier checks leave the page in test-rules mode, where this
    // surface holds a rule set rather than prose.
    await send('Page.navigate', { url: base });
    await sleep(2500);
    const surface = await evaluate(`(async () => {
      const t = document.getElementById('input');
      t.value = 'It is important to note that the results are not just good, but transformative.';
      t.dispatchEvent(new Event('input'));
      await new Promise(r => setTimeout(r, 1800));
      const doc = document.getElementById('doc');
      const cs = getComputedStyle(doc);
      return JSON.stringify({
        edit: document.getElementById('pane-doc').dataset.edit,
        marks: doc.querySelectorAll('mark').length,
        onTheText: doc.textContent.startsWith('It is important'),
        docIgnoresPointer: cs.pointerEvents === 'none',
        markTakesPointer: !!doc.querySelector('mark')
          && getComputedStyle(doc.querySelector('mark')).pointerEvents === 'auto',
        oneCopy: document.querySelectorAll('#input').length === 1
      });
    })()`);
    const SF = JSON.parse(surface);
    check('the text you paste is the surface the findings are drawn on',
      SF.edit === 'on' && SF.marks > 0 && SF.onTheText && SF.oneCopy, JSON.stringify(SF));
    check('the caret reaches the text and the marks stay clickable',
      SF.docIgnoresPointer && SF.markTakesPointer, JSON.stringify(SF));

    // The rules used to hide behind a button, and the menu opened over the
    // text. They are a panel of their own now, so nothing can overlap anything.
    await send('Page.navigate', { url: base });
    await sleep(2500);
    const rulesPane = await evaluate(`(() => {
      const p = document.getElementById('pane-rules');
      const r = document.getElementById('rules');
      const doc = document.getElementById('doc');
      const a = p.getBoundingClientRect(), b = doc.getBoundingClientRect();
      const overlaps = !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
      return JSON.stringify({ visible: a.width > 100 && a.height > 100,
                              sets: r.querySelectorAll('[data-toggle]').length,
                              overlapsText: overlaps, popoverGone: !document.getElementById('b-rules') });
    })()`);
    const RP = JSON.parse(rulesPane);
    check('the rules are a panel of their own, overlapping nothing',
      RP.visible && RP.sets >= 5 && !RP.overlapsText && RP.popoverGone, JSON.stringify(RP));


    // The theme is a property of the reader, not of the page. It was stored
    // correctly and never applied on load, so a choice made anywhere vanished
    // the moment you moved: the value was in localStorage the whole time.
    await send('Page.navigate', { url: base + 'vocabulary.html' });
    await sleep(2500);
    const themed = await evaluate(`(async () => {
      document.getElementById('theme').click();
      await new Promise(r => setTimeout(r, 300));
      return document.documentElement.dataset.theme || 'auto';
    })()`);
    const picked = themed.replace(/^"|"$/g, '');
    for (const [where, url] of [['check', base], ['rules', base + 'rules.html']]) {
      await send('Page.navigate', { url });
      await sleep(2500);
      const got = (await evaluate(`document.documentElement.dataset.theme || 'auto'`))
        .replace(/^"|"$/g, '');
      check(`the theme chosen on one page holds on ${where}`, got === picked,
        `picked ${picked}, ${where} showed ${got}`);
    }

    // How to run it has to be reachable from every page, and the sheet is the
    // only place it lives now. It broke on first build because .sheet was
    // already the name of a dead overlay on vocabulary.
    for (const [where, url] of [['check', base], ['rules', base + 'rules.html'],
                                ['vocabulary', base + 'vocabulary.html']]) {
      await send('Page.navigate', { url });
      await sleep(2200);
      const sheet = await evaluate(`(async () => {
        const b = document.getElementById('installer');
        if (!b) return JSON.stringify({err: 'no button'});
        const r = b.getBoundingClientRect();
        const panel = document.querySelector('.say').getBoundingClientRect();
        const inPanel = r.left >= panel.left - 2 && r.right <= panel.right + 2
                        && r.top >= panel.top - 2;
        const wide = r.width > panel.width * 0.8;
        b.click();
        await new Promise(r => setTimeout(r, 300));
        const d = document.querySelector('dialog.sheet');
        const cmds = [...d.querySelectorAll('.sheet-c pre')].map(p => p.textContent);
        return JSON.stringify({open: d.open, blocks: cmds.length,
          overflows: d.scrollWidth > d.clientWidth + 2,
          inPanel, wide,
          // The skill is the call to action, so it leads.
          skillFirst: cmds[0].includes('.claude/skills/linting-prose'),
          npx: cmds.some(c => c.includes('npx --yes github:bheijden/slop')),
          skill: cmds.some(c => c.includes('.claude/skills/linting-prose'))});
      })()`);
      const H = JSON.parse(sheet);
      check(`installing it is the call to action on ${where}`,
        H.open && H.blocks >= 5 && H.npx && H.skill && !H.overflows
        && H.skillFirst && H.inPanel && H.wide, JSON.stringify(H));
    }

    // One type size for the standing prose, on all three pages and at any
    // viewport. It used to shrink at two viewport heights, so the same
    // paragraph was 13px on a tall tablet and 11.5px on a short laptop.
    const sizes = [];
    for (const [where, url] of [['check', base], ['rules', base + 'rules.html'],
                                ['vocabulary', base + 'vocabulary.html']]) {
      for (const h of [900, 880, 800, 620]) {
        await send('Emulation.setDeviceMetricsOverride',
          { width: h >= 880 ? 1500 : 1180, height: h, deviceScaleFactor: 1, mobile: false });
        await send('Page.navigate', { url });
        await sleep(1600);
        const got = await evaluate(`(() => { const p = document.querySelector('.say p');
          const c = getComputedStyle(p), say = document.querySelector('.say');
          const panel = say.getBoundingClientRect();
          const cta = document.getElementById('installer').getBoundingClientRect();
          return JSON.stringify({ font: c.fontSize,
            fills: p.getBoundingClientRect().width / say.clientWidth,
            // The button must never be what a short window cuts off.
            ctaWhole: cta.top >= panel.top - 1 && cta.bottom <= panel.bottom + 1 && cta.height > 30,
            // The freshness line is not an answer if you have to scroll to it,
            // so it lives outside the prose and must always be whole.
            stampWhole: (() => { const st = say.querySelector('.stamp').getBoundingClientRect();
              return st.top >= panel.top - 1 && st.bottom <= panel.bottom + 1 && st.height > 8; })(),
            // At the size the dashboard is designed for, nothing should scroll.
            fitsAtSize: (() => { const pr = say.querySelector('.prose');
              return pr.scrollHeight <= pr.clientHeight + 1; })() });
        })()`);
        sizes.push({ where, h, ...JSON.parse(got) });
      }
    }
    await send('Emulation.clearDeviceMetricsOverride');
    const one = [...new Set(sizes.map((x) => x.font))];
    check('the standing prose is one size everywhere',
      one.length === 1 && one[0] === '13px', sizes.map((x) => `${x.where}@${x.h}:${x.font}`).join(' '));
    // And it uses the column it is given rather than stopping short of it.
    check('the prose uses the width of its panel',
      sizes.every((x) => x.fills > 0.85), sizes.map((x) => x.fills.toFixed(2)).join(' '));
    // The standing prose is the panel's whole job and it must fit without
    // scrolling at a normal window: three claims, live numbers, and a stamp.
    // The stamp and the button are the two things a smaller window must not eat.
    check('the freshness line is always whole', sizes.every((x) => x.stampWhole),
      sizes.filter((x) => !x.stampWhole).map((x) => `${x.where}@${x.h}`).join(' '));

    // And at the size the dashboard is built for, the prose fits without one.
    const roomy = sizes.filter((x) => x.h >= 880);
    check('at a full-size window nothing in the panel scrolls',
      roomy.length > 0 && roomy.every((x) => x.fitsAtSize),
      roomy.filter((x) => !x.fitsAtSize).map((x) => `${x.where}@${x.h}`).join(' '));

    // Only the prose scrolls, so the call to action survives a short window.
    check('the call to action is never the thing that gets cut off',
      sizes.every((x) => x.ctaWhole),
      sizes.filter((x) => !x.ctaWhole).map((x) => `${x.where}@${x.h}`).join(' '));

    // A definition that cannot be seen is not a definition. This broke on two
    // pages at once because the tooltip element took a class name those pages
    // had already given a tooltip of their own, which hides itself at
    // opacity 0 until a class is added that this one never adds.
    for (const [where, url] of [['check', base], ['rules', base + 'rules.html'],
                                ['vocabulary', base + 'vocabulary.html']]) {
      await send('Page.navigate', { url });
      await sleep(2200);
      const seen = await evaluate(`(async () => {
        const t = document.querySelector('.say .term');
        if (!t) return JSON.stringify({err: 'no defined term in the panel'});
        t.dispatchEvent(new PointerEvent('pointerover', {bubbles: true, pointerType: 'mouse'}));
        await new Promise(r => setTimeout(r, 250));
        const tip = document.getElementById('deftip'), c = getComputedStyle(tip);
        return JSON.stringify({ term: t.textContent, opacity: c.opacity, display: c.display,
          width: Math.round(tip.getBoundingClientRect().width),
          text: tip.textContent.length,
          // Only one element may answer to this id, or the wrong one gets styled.
          copies: document.querySelectorAll('#deftip').length });
      })()`);
      const V = JSON.parse(seen);
      check(`a defined term can actually be read on ${where}`,
        V.opacity === '1' && V.display !== 'none' && V.width > 60 && V.text > 40 && V.copies === 1,
        JSON.stringify(V));
    }

    // The page opens on the example: an empty box shows nothing of what this
    // does. Clear is the way back to empty, and the example must not override
    // anything that actually arrived.
    await send('Page.navigate', { url: base });
    await sleep(2600);
    const opens = await evaluate(`(async () => {
      const ta = document.getElementById('input'), clr = document.getElementById('b-clear');
      const start = { chars: ta.value.length, findings: document.querySelectorAll('#list li').length,
                      clear: !clr.hidden };
      clr.click();
      await new Promise(r => setTimeout(r, 1200));
      const cleared = { chars: ta.value.length,
                        findings: document.querySelectorAll('#list li').length,
                        clear: !clr.hidden };
      document.getElementById('b-example').click();
      await new Promise(r => setTimeout(r, 1800));
      return JSON.stringify({ start, cleared,
        back: { chars: ta.value.length, clear: !clr.hidden } });
    })()`);
    const OP = JSON.parse(opens);
    check('the page opens with the example already in it',
      OP.start.chars > 3000 && OP.start.findings > 10 && OP.start.clear, JSON.stringify(OP.start));
    check('clear empties it and takes its own button away',
      OP.cleared.chars === 0 && OP.cleared.findings === 0 && !OP.cleared.clear,
      JSON.stringify(OP.cleared));
    check('and the example can be loaded again after clearing',
      OP.back.chars > 3000 && OP.back.clear, JSON.stringify(OP.back));

    // An error has to be visible. note() wrote to #score, which existed only on
    // the rule sets page, so on check a bad URL or a worker timeout produced
    // nothing at all on screen.
    await send('Page.navigate', { url: `${base}?probe=err#url=./definitely-not-here.md` });
    await sleep(2600);
    const errored = await evaluate(`JSON.stringify({
      shown: (document.getElementById('score') || {}).textContent || '',
      hasSurface: !!document.getElementById('score') })`);
    const ER = JSON.parse(errored);
    check('a failure says so on the page', ER.hasSurface && ER.shown.trim().length > 0,
      JSON.stringify(ER));
    await send('Page.navigate', { url: base });
    await sleep(2000);

    // `slop check --share` prints a link carrying the text in the fragment.
    // The helper that decodes it was left behind when this page's script moved
    // out of index.html, and the three calls went with it, so every shared link
    // threw ReferenceError and opened an empty page.
    const shared = Buffer.from('It is important to note that a. No x, no y, no z.\n')
      .toString('base64url');
    await send('Page.navigate', { url: `${base}?probe=share#text=${shared}&kind=md&name=shared.md` });
    await sleep(2600);
    const opened = await evaluate(`JSON.stringify({
      text: document.getElementById('input').value.trim(),
      findings: document.querySelectorAll('#list li').length })`);
    const SH = JSON.parse(opened);
    check('a shared link opens the text it carries, over the example',
      /important to note/.test(SH.text) && SH.findings > 0
      && !/retry loop/.test(SH.text), JSON.stringify(SH));
    await send('Page.navigate', { url: base });
    await sleep(2000);

    // The lower-left panel belongs to the page it is on. On check it asks which
    // sets to run; on test rules that question is meaningless -- the page tests
    // what is in the editor -- so it offers a set to open instead.
    await send('Page.navigate', { url: base + 'rules.html' });
    await sleep(2500);
    const lib = await evaluate(`(async () => {
      const b = [...document.querySelectorAll('.libset')].find(x => /Simon/.test(x.textContent));
      if (!b) return JSON.stringify({err: 'no library'});
      b.click();
      await new Promise(r => setTimeout(r, 1200));
      return JSON.stringify({sets: document.querySelectorAll('.libset').length,
        boxes: document.querySelectorAll('#rules input[type=checkbox]').length,
        head: document.querySelector('#pane-rules .title').textContent,
        order: [...document.querySelectorAll('.libset .nm')].map(n => n.textContent).slice(0, 3),
        nav: [...document.querySelectorAll('.mast a')].map(a => a.textContent),
        opened: document.getElementById('rules-src').value.includes('"simonwillison"')});
    })()`);
    const L = JSON.parse(lib);
    check('rule sets offers a set to open, not a set to tick',
      L.sets >= 5 && L.boxes === 0 && L.head === 'library' && L.opened, JSON.stringify(L));
    // The hand-written regex sets lead, because this page is where you go to
    // read one. The two derived sets are a single generated pattern each and
    // teach nothing about the format, so they follow.
    check('the sets that best show the format come first',
      JSON.stringify(L.order) === JSON.stringify(['Simon Willison', 'AI tells',
        'Signs of AI writing (Wikipedia)']), JSON.stringify(L.order));
    check('the page is called rule sets', L.nav.includes('rule sets'), L.nav.join(','));
    // "vocabulary" did not say which vocabulary. The nav names the set, and the
    // set's name in the panel is the way to the page that argues for it.
    check('the nav names the derived set', L.nav.includes('PR vocabulary'), L.nav.join(','));
    await send('Page.navigate', { url: base });
    await waitFor('#rules input[type=checkbox]');
    const box = await evaluate(`JSON.stringify({
      boxes: document.querySelectorAll('#rules input[type=checkbox]').length,
      sets: document.querySelectorAll('.libset').length})`);
    const B = JSON.parse(box);
    check('check still asks which sets to run', B.boxes > 5 && B.sets === 0, JSON.stringify(B));

    // The stamp's set name is a link. tip.mjs swallows a click on anything
    // carrying a definition so a tap can toggle it, which would have made this
    // link inert on touch and on the desk alike.
    await send('Page.navigate', { url: base });
    await sleep(2200);
    const stampLink = await evaluate(`(async () => {
      const a = document.querySelector('.stamp a.term');
      if (!a) return JSON.stringify({err: 'the set name is not a link'});
      a.dispatchEvent(new PointerEvent('pointerover', {bubbles: true, pointerType: 'mouse'}));
      await new Promise(r => setTimeout(r, 250));
      const tip = document.getElementById('deftip');
      return JSON.stringify({ text: a.textContent, href: a.getAttribute('href'),
        defines: getComputedStyle(tip).opacity === '1' && tip.textContent.length > 40 });
    })()`);
    const SL = JSON.parse(stampLink);
    check('the derived set names itself and links to its page',
      SL.href === 'vocabulary.html' && /vocabulary/i.test(SL.text || '') && SL.defines,
      JSON.stringify(SL));
    await evaluate(`document.querySelector('.stamp a.term').click()`);
    await sleep(2500);
    const landed = await evaluate(`location.pathname.split('/').pop()`);
    check('and clicking it actually goes there',
      /vocabulary\.html/.test(landed), landed);

    // The vocabulary page is a separate document with its own data file and its
    // own layout, so nothing above touches it. It has broken three times on data
    // shape alone, and once on a stale cached data file paired with a fresh page.
    await send('Page.navigate', { url: base + 'vocabulary.html' });
    await sleep(3000);
    const voc = await evaluate(`JSON.stringify({
      say: document.getElementById('say1').textContent.slice(0, 30),
      counts: document.querySelectorAll('#tally b').length,
      bands: document.querySelectorAll('#arrive path').length,
      words: document.querySelectorAll('#list li').length,
      which: document.getElementById('which').textContent,
      cap: document.getElementById('acap').textContent,
      word: (document.querySelector('.word-head .w') || {}).textContent || null,
      facts: document.querySelectorAll('.word-head .facts span').length,
      rateLines: document.querySelectorAll('#rate path[stroke-width]').length
    })`);
    const v = JSON.parse(voc);
    check('vocabulary page loads its data',
      !/Could not load/.test(v.say) && v.words > 0 && v.counts === 3,
      JSON.stringify(v).slice(0, 170));
    check('the arrival chart draws a band per cluster',
      v.bands >= 5 && /share of all pull requests/.test(v.cap), `${v.bands} bands, "${v.cap}"`);
    check('a word opens with its rates and its trajectory',
      !!v.word && v.facts >= 3 && v.rateLines >= 2, JSON.stringify(v).slice(0, 140));

    // Every term the page invents has to define itself where it is used. The
    // page quoted three different percentages, two of them called "signed",
    // and explained none of them.
    // data-tip, not title: the page's escaper left quotes alone, and the
    // definition of "signed" quotes a footer verbatim, so the attribute ended
    // at that quote and the tooltip lost the rest of the sentence. A native
    // tooltip also never fires on a touch screen.
    const terms = await evaluate(`(async () => {
      const all = [...document.querySelectorAll('.term')];
      const sig = all.find(e => e.textContent.trim() === 'signed');
      sig.dispatchEvent(new PointerEvent('pointerover', {bubbles: true, pointerType: 'mouse'}));
      await new Promise(r => setTimeout(r, 200));
      const tip = document.getElementById('deftip');
      return JSON.stringify({
        marked: all.length,
        undefined_: all.filter(e => !e.dataset.tip || e.dataset.tip.length < 40).length,
        stillUsingTitle: all.filter(e => e.title).length,
        // The quoted footer is past the first quote, so its presence proves the
        // definition was not cut there.
        whole: /Generated with Claude Code/.test(sig.dataset.tip)
               && /recognising the line itself/.test(sig.dataset.tip),
        hovered: (() => { const c = getComputedStyle(tip);
          return !tip.hidden && tip.textContent === sig.dataset.tip
                 && c.opacity === '1' && c.visibility !== 'hidden' && c.display !== 'none'
                 && tip.getBoundingClientRect().width > 60; })(),
        signedFigures: [...new Set([...document.body.innerText.matchAll(/([\\d.]+)% signed/g)].map(m => m[1]))]
      });
    })()`);
    const TM = JSON.parse(terms);
    check('the words the page invents define themselves',
      TM.marked >= 4 && TM.undefined_ === 0 && TM.stillUsingTitle === 0, JSON.stringify(TM));
    check('a definition survives the quotes inside it',
      TM.whole === true, JSON.stringify(TM.whole));
    check('hovering a term shows its definition', TM.hovered === true, JSON.stringify(TM.hovered));

    // The method is not ours, and that belongs in the claim rather than in a
    // footnote under it: the first sentence names him and links his page.
    const credit = await evaluate(`(async () => {
      const a = document.querySelector('.say a[href*="louisabraham"]');
      if (!a) return JSON.stringify({err: 'no attribution in the standing prose'});
      const first = document.getElementById('say1');
      a.dispatchEvent(new PointerEvent('pointerover', {bubbles: true, pointerType: 'mouse'}));
      await new Promise(r => setTimeout(r, 250));
      const tip = document.getElementById('deftip');
      const what = tip.textContent;
      return JSON.stringify({ inFirstClaim: first.contains(a), text: a.textContent,
        href: a.getAttribute('href'),
        // His name is on the page, not only behind a hover.
        namesHim: /Louis Abraham/.test(first.innerText),
        // The claim names the method, so a reader is not sent off the page to
        // find out what was run.
        namesMethod: /k-means/.test(first.innerText),
        // And the hover explains his method and what differs here, both.
        describesHis: /no labels go in/.test(what),
        saysWhatChanged: /signature/.test(what) && /threshold/.test(what),
        visible: getComputedStyle(tip).opacity === '1' });
    })()`);
    const CR = JSON.parse(credit);
    check('the method is credited in the claim itself',
      CR.inFirstClaim && CR.namesHim && CR.namesMethod && /louisabraham/.test(CR.href || '')
      && CR.describesHis && CR.visible && CR.saysWhatChanged,
      JSON.stringify(CR));

    // Paging is the whole point of the browse view: every cluster has to carry a
    // list of its own, not just the one that gets published.
    const paged = await evaluate(`(async () => {
      const first = [...document.querySelectorAll('#list li')].map(l => l.dataset.w).slice(0, 5);
      document.getElementById('next').click();
      await new Promise(r => setTimeout(r, 400));
      return JSON.stringify({ first,
        second: [...document.querySelectorAll('#list li')].map(l => l.dataset.w).slice(0, 5),
        which: document.getElementById('which').textContent,
        rows: document.querySelectorAll('#list li').length,
        about: document.getElementById('about').textContent });
    })()`);
    const P = JSON.parse(paged);
    check('paging shows a different cluster with its own words',
      P.rows > 0 && P.first.join() !== P.second.join() && /^\d+ \/ \d+$/.test(P.which)
      && /pull requests/.test(P.about), JSON.stringify(P).slice(0, 200));

    // The stack is decided once. The cluster the rule is built from is on the
    // axis and stays there; cycling recolours a band and moves nothing.
    // Fresh, because an earlier check has already paged away from it.
    await send('Page.navigate', { url: base + 'vocabulary.html' });
    await sleep(3000);
    const stack = await evaluate(`(async () => {
      const geom = () => [...document.querySelectorAll('#arrive path')].map(p => p.getAttribute('d'));
      const fills = () => [...document.querySelectorAll('#arrive path')].map(p => p.getAttribute('fill'));
      const bottom = () => (document.querySelector('#arrive path title') || {}).textContent || '';
      const g1 = geom(), f1 = fills(), b1 = bottom();
      document.getElementById('next').click();
      await new Promise(r => setTimeout(r, 400));
      document.getElementById('next').click();
      await new Promise(r => setTimeout(r, 400));
      // the pager reads "NN / total"; the highlighted band must be NN - 1, so
      // that cycling walks the highlight straight up the stack
      const at = () => fills().indexOf('var(--flag)');
      const shown = () => parseInt(document.getElementById('which').textContent, 10);
      const lockstep = at() === shown() - 1;
      return JSON.stringify({ bands: g1.length, lockstep,
        sameOrder: JSON.stringify(g1) === JSON.stringify(geom()),
        sameBottom: b1 === bottom(),
        highlightMoved: JSON.stringify(f1) !== JSON.stringify(fills()),
        // the page opens on the published cluster, so at first render the
        // bottom band is the coloured one; after cycling it must still be the
        // same band, but no longer coloured
        bottomStartsColoured: f1[0] === 'var(--flag)',
        bottomNoLongerColoured: fills()[0] !== 'var(--flag)' });
    })()`);
    const ST = JSON.parse(stack);
    check('the stack never moves, and the highlight climbs it in step',
      ST.bands >= 5 && ST.sameOrder && ST.sameBottom && ST.highlightMoved
      && ST.bottomStartsColoured && ST.bottomNoLongerColoured && ST.lockstep,
      JSON.stringify(ST));

    // One metric explains the stack: signed share, descending. Position 0 is
    // therefore the cluster the rule is built from, because that is the same
    // metric's maximum. Before this, 0 was the published one and 1..9 were
    // ordered by size, so the axis carried two meanings at once.
    const ord = await evaluate(`(async () => {
      const d = await fetch('vocabulary-data.json').then(r => r.json());
      const c = d.browse.map(x => x.stamped);
      return JSON.stringify({stamped: c, sorted: c.every((v,i) => i === 0 || c[i-1] >= v),
        ids: d.browse.map(x => x.id).join(','),
        publishedIsZero: d.browse.findIndex(x => x.published) === 0});
    })()`);
    const O = JSON.parse(ord);
    check('the stack is ordered by one number, and the rule comes from the top of it',
      O.sorted && O.publishedIsZero, JSON.stringify(O));

    // Two clocks run behind this page -- a daily sample and a weekly fit -- and
    // which one last moved was only answerable by reading the workflow file.
    const fresh = await evaluate(`(async () => {
      const d = await fetch('vocabulary-data.json').then(r => r.json());
      const el = document.getElementById('stamp');
      const box = el.getBoundingClientRect();
      return JSON.stringify({ text: el.innerText,
        saysSampled: el.innerText.includes(d.sample.to),
        saysBuilt: el.innerText.includes(d.built),
        oneLine: box.height < 26 });
    })()`);
    const F = JSON.parse(fresh);
    check('the page says how fresh it is', F.saysSampled && F.saysBuilt && F.oneLine,
      JSON.stringify(F));

    // The editing surface draws the same text twice: a transparent textarea for
    // the caret and selection, and a highlighted copy on top. Any metric that
    // differs makes the selection drift off the words, a little more with every
    // line. It was 1.7 against 1.75 -- 49px apart by the end of the example.
    await send('Page.navigate', { url: base });
    await sleep(2200);
    const layers = await evaluate(`(async () => {
      document.getElementById('b-example').click();
      await new Promise(r => setTimeout(r, 1500));
      const ta = document.getElementById('input'), doc = document.getElementById('doc');
      const a = getComputedStyle(ta), b = getComputedStyle(doc);
      const same = (k) => a[k] === b[k];
      return JSON.stringify({
        metrics: ['fontSize', 'lineHeight', 'fontFamily', 'letterSpacing', 'wordSpacing',
                  'paddingTop', 'paddingLeft', 'paddingRight'].filter((k) => !same(k)),
        drift: Math.abs(ta.scrollHeight - doc.scrollHeight),
        lines: Math.round(ta.scrollHeight / parseFloat(a.lineHeight)) });
    })()`);
    const LY = JSON.parse(layers);
    check('the two layers of the editor line up exactly',
      LY.metrics.length === 0 && LY.drift <= 1 && LY.lines > 20, JSON.stringify(LY));

    // And they must say the same thing. The highlighted copy is built by
    // walking the findings and slicing the source between them; an overlap the
    // range filter let through made it slice backwards and write a phrase
    // twice, so the page showed text the textarea underneath did not have.
    const sameText = await evaluate(`(() => {
      const norm = (x) => x.replace(/\\s+/g, ' ').trim();
      const a = norm(document.getElementById('input').value);
      const b = norm(document.getElementById('doc').innerText);
      let at = -1;
      for (let k = 0; k < Math.min(a.length, b.length); k++) if (a[k] !== b[k]) { at = k; break; }
      return JSON.stringify({ equal: a === b, extra: b.length - a.length,
        around: at < 0 ? '' : b.slice(Math.max(0, at - 30), at + 40) });
    })()`);
    const ST2 = JSON.parse(sameText);
    check('the highlighted copy says exactly what was typed',
      ST2.equal && ST2.extra === 0, JSON.stringify(ST2));

    // A mark may colour the text; it may not move it. Every pixel it adds to
    // the horizontal advance displaces everything after it on that line, and
    // the selection is drawn by the textarea underneath, which has no marks.
    // 1px of padding either side was 2px per mark, compounding across a line.
    const boxes = await evaluate(`(() => {
      const m = document.querySelector('#doc mark');
      if (!m) return JSON.stringify({err: 'no marks'});
      const c = getComputedStyle(m);
      const n = (v) => parseFloat(v) || 0;
      return JSON.stringify({
        left: n(c.paddingLeft) + n(c.marginLeft) + n(c.borderLeftWidth),
        right: n(c.paddingRight) + n(c.marginRight) + n(c.borderRightWidth),
        display: c.display });
    })()`);
    const BX = JSON.parse(boxes);
    check('a mark colours the text without moving it',
      Math.abs(BX.left) < 0.01 && Math.abs(BX.right) < 0.01, JSON.stringify(BX));

    // The example is the demonstration, so it has to demonstrate: one piece of
    // writing long enough to be scored, tripping the hand-written patterns and
    // both derived word lists, rather than a paragraph for each bolted on.
    const shown = await evaluate(`JSON.stringify({
      findings: document.querySelectorAll('#list li').length,
      sets: [...document.querySelectorAll('#rules .hits')].length,
      words: (document.querySelector('.tally b') || {}).textContent || '0' })`);
    const EX = JSON.parse(shown);
    check('the example sets off enough to be worth reading',
      EX.findings >= 15 && EX.sets >= 4 && Number(String(EX.words).replace(/,/g, '')) >= 600,
      JSON.stringify(EX));


    // Nothing on this page may use a word invented in the making of it. A reader
    // arrives with no context and the copy has to work anyway.
    // Scoped to the copy we wrote, not the whole page: the word list is data, and
    // it legitimately contains words like "registered". Whole words only, for the
    // same reason.
    const jargon = await evaluate(`(() => {
      const sel = '.mast, .say, .capbar, .find, .strip, .tally, .word-head .u';
      const t = [...document.querySelectorAll(sel)].map(e => e.innerText).join(' ').toLowerCase();
      return JSON.stringify(['register', 'small group', 'unsigned', 'lift', 'stratum', 'strata',
        'contrast', 'corpus'].filter(w => new RegExp('\\b' + w + '\\b').test(t)));
    })()`);
    const J = JSON.parse(jargon);
    check('the page uses no word invented in this project', J.length === 0, J.join(', '));

    const clicked = await evaluate(`(async()=>{
      const li=[...document.querySelectorAll('#list li')][3];
      const want=li.dataset.w; li.click(); await new Promise(r=>setTimeout(r,300));
      return JSON.stringify({want, got:(document.querySelector('.word-head .w')||{}).textContent})})()`);
    const cl = JSON.parse(clicked);
    check('clicking a word selects it', cl.want === cl.got, JSON.stringify(cl));

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
