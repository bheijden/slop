// Everything check.html and rules.html both need.
//
// They are two pages because they are two things you do, but they share almost
// all of their machinery: the same worker, the same rule sets, the same
// drag-and-drop, the same panel of rules down the left. The page says which of
// the two it is by setting data-page on its body; nothing else here branches on
// it beyond that.
//
// Elements a given page does not have simply are not there. $() hands back a
// detached stub for those rather than null, so neither page has to carry the
// other's markup just to keep this file quiet.

import { readZip } from '../js/zip.mjs';

// The three counts in the top-right cell. Same shape on every page: a rule of
// colour, a number, a label.
function tally(words) {
  const n = (S.flat || []).length;
  const w = words != null ? words : (S.results || []).reduce((a, r) => a + (r.words || 0), 0);
  const rate = w ? (1000 * n / w) : 0;
  const cells = S.mode === 'fudge'
    ? (() => {
        const f = S.fudge || [];
        const t = f.reduce((a, r) => ({ n: a.n + 1,
          ok: a.ok + r.conform.ok + r.fudge.ok,
          bad: a.bad + r.conform.fail + r.fudge.fail }), { n: 0, ok: 0, bad: 0 });
        return [['var(--p0)', String(t.n), t.n === 1 ? 'rule' : 'rules'],
                ['var(--p2)', String(t.ok), 'passing'],
                ['var(--p1)', String(t.bad), 'failing']];
      })()
    : [['var(--p0)', w.toLocaleString('en'), 'words'],
       ['var(--p1)', String(n), n === 1 ? 'finding' : 'findings'],
       ['var(--p4)', rate ? rate.toFixed(1) : '0', 'per 1000 words']];
  const el = document.getElementById('tally');
  if (el) el.innerHTML = cells.map(([c, v, l]) =>
    `<div><i style="background:${c}"></i><b>${v}</b><span>${l}</span></div>`).join('');
}

const GONE = new Map();
// The layout no longer has resizable dividers, a file-tree splitter or a rules
// popover; the code driving them is gone. A stub keeps any straggler harmless
// instead of throwing on a null.
const $ = (id) => document.getElementById(id)
  || GONE.get(id)
  || (GONE.set(id, Object.assign(document.createElement('div'), { id })), GONE.get(id));
const esc = (s) => s.replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const attr = (s) => String(s).replace(/[&<>"']/g,
  (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Terms this project invents, defined where they are used. web/tip.mjs turns
// any [data-tip] into a tooltip that also works on a touch screen.
const DEF = {
  finding: 'One place a rule fired: the line it came from, the words that triggered it, and what '
         + 'to write instead. A rule that reports on the document as a whole gives one finding '
         + 'carrying its rate rather than one per occurrence.',
  ruleSet: 'A single JSON file holding patterns, when each one is worth reporting, and the '
         + 'examples it must catch and must not. Every set here is one file, and you can load '
         + 'your own from a URL or off disk.',
  derived: 'This set is not written by hand. It is a word list measured from public GitHub pull '
         + 'request descriptions, re-derived every Monday, so it follows how machine writing '
         + 'actually moves rather than how anyone remembers it. The date is that last rebuild. '
         + 'Open the PR vocabulary page to see where the words came from.',
  variants: 'The same example marked up twenty-two different ways — bold in the middle of a word, '
          + 'a link around half of it, an HTML entity for the apostrophe, a line break mid-phrase. '
          + 'A pattern that only matches clean text passes the example and fails these.',
};
const term = (k, text) => `<span class="term" tabindex="0" data-tip="${attr(DEF[k])}">${esc(text)}</span>`;
const termLink = (k, text, href) => `<a class="term" href="${attr(href)}" `
  + `data-tip="${attr(DEF[k])}">${esc(text)}</a>`;

// The standing prose on the left, which is the only panel that does not change
// between pages. One claim per paragraph, live numbers in bold, and a stamp
// saying how fresh the derived lists are.
function renderSay() {
  const sets = S.sets.length;
  const rules = S.sets.reduce((a, x) => a + x.rules.length, 0);
  // Only the derived set carries a build date, so name it rather than saying
  // "two are derived", which left the reader asking which two.
  const measured = S.sets.find((x) => x.corpus?.built);
  if (PAGE === 'check') {
    // Open with the tells themselves. Anyone who has read a generated draft
    // recognises these two on sight, and recognition is the whole argument.
    $('say1').innerHTML = '<b>It is important to note that&hellip;</b> &middot; '
      + '<b>No X, no Y, no Z.</b>';
    $('say2').innerHTML = `You know the feeling. <b>${rules} patterns</b> in <b>${sets}</b> `
      + `${term('ruleSet', 'rule sets')} find AI slop.`;
    // The difference from a detector: a score tells you something is wrong, a
    // named tell tells an agent what to change.
    $('say3').innerHTML = `Each ${term('finding', 'finding')} names the tell and the fix, so an `
      + 'agent can correct its own draft.';
  } else {
    const n = S.fudge && S.fudge.length ? S.fudge.length : 0;
    const ex = S.fudge ? S.fudge.reduce((a, r) => a + r.conform.ok + r.conform.fail, 0) : 0;
    $('say1').innerHTML = 'Write a rule set and watch it hold or fail. The editor has '
      + `<b>${n} ${n === 1 ? 'rule' : 'rules'}</b>`
      + (ex ? `, <b>${ex}</b> ${ex === 1 ? 'example' : 'examples'}` : '') + '.';
    $('say2').innerHTML = `Each runs as written, then again through <b>22</b> `
      + `${term('variants', 'markup variants')}.`;
    $('say3').innerHTML = `Open any of the <b>${sets}</b> on the left. Every one is a single `
      + 'JSON file you can fork.';
  }
  $('stamp').innerHTML = measured
    ? `${termLink('derived', measured.title || measured.name, 'vocabulary.html')} rebuilt `
      + `<b>${esc(measured.corpus.built)}</b>`
    : `<b>${rules}</b> rules in <b>${sets}</b> sets`;
}
const PAGE = document.body.dataset.page === 'rules' ? 'rules' : 'check';
const S = { sets:[], active:new Set(), docs:[], results:[], flat:[], cur:0, doc:0, skipped:0,
            kind:'md', name:'input', setFile:{},
            view:'source', mode:(PAGE === 'rules' ? 'fudge' : 'check'),
            sel:-1, fudge:null,
            layout:store('pc-layout', 'split'),
            split:parseFloat(store('pc-split', '60')),
            setOpen:{}, byId:{},
            tree:store('pc-tree', 'open'),
            treeW:parseFloat(store('pc-treew', '220')) };

function store(k, dflt) { try { return localStorage.getItem(k) ?? dflt; } catch { return dflt; } }
function remember(k, v) { try { localStorage.setItem(k, v); } catch {} }

/* theme — the toggle wins over the OS, because a browser forced to dark for
   every site should not force it here too. */
const THEMES = ['auto','light','dark'];
let theme = (() => { try { return localStorage.getItem('slop-theme') || 'auto'; } catch { return 'auto'; } })();
function applyTheme() {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  // The icon shows the state; there is no label to keep in step.
  try { localStorage.setItem('slop-theme', theme); } catch {}
}
// Apply what was stored, not merely read it. Without this the choice survived
// in localStorage and was ignored on every load, so a theme picked on the
// vocabulary page vanished the moment you moved to another one.
applyTheme();
$('theme').onclick = () => { theme = THEMES[(THEMES.indexOf(theme) + 1) % 3]; applyTheme(); };
const gunzip = async (bytes) =>
  new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();

async function readHash() {
  const p = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (p.get('kind')) S.kind = p.get('kind');
  for (const url of p.getAll('rules')) await addRemoteSet(url).catch((e) => note(e.message));
  const sel = (p.get('select') || '').split(',').filter(Boolean);
  if (sel.length) {
    S.active = new Set();
    for (const s of S.sets) for (const r of s.rules) if (sel.includes(s.name) || sel.includes(r.id)) S.active.add(r.id);
  }
  for (const i of (p.get('ignore') || '').split(',').filter(Boolean)) {
    const set = S.sets.find((s) => s.name === i);
    if (set) set.rules.forEach((r) => S.active.delete(r.id)); else S.active.delete(i);
  }
  let src = '';
  if (p.get('bundle')) {
    try {
      S.docs = JSON.parse(await gunzip(b64urlToBytes(p.get('bundle'))));
      S.doc = 0;
      return;
    } catch (e) { note(`could not read that bundle: ${e.message}`); }
  }
  if (p.get('gz')) src = await gunzip(b64urlToBytes(p.get('gz')));
  else if (p.get('text')) src = new TextDecoder().decode(b64urlToBytes(p.get('text')));
  else if (p.get('url')) {
    note('fetching ' + p.get('url') + ' …');
    try {
      const res = await fetch(p.get('url'), { redirect:'follow' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      src = await res.text();
      if (/html/i.test(res.headers.get('content-type') || '')) S.kind = 'html';
      note('');
    } catch (e) { note(`could not fetch that URL (${e.message}) — the site must allow cross-origin reads`); }
  }
  if (p.get('name')) S.name = p.get('name');
  if (src) { $('input').value = src; $('kind').value = S.kind; }
}

/* rule sets */
async function addRemoteSet(url) {
  const res = await fetch(url, { headers:{accept:'application/json'} });
  if (!res.ok) throw new Error(`rule set ${url}: HTTP ${res.status}`);
  const set = await res.json();
  if (!Array.isArray(set.rules)) throw new Error(`rule set ${url}: no "rules" array`);
  set.name = set.name || url.split('/').pop().replace(/\.json$/, '');
  addSet(set);
}
function addSet(set, on = true) {
  S.sets = S.sets.filter((s) => s.name !== set.name);
  S.sets.push(set);
  for (const r of set.rules) {
    // An opt-in set still runs any rule that explicitly asks to.
    if (on ? r.default !== 'off' : r.default === 'on') S.active.add(r.id);
    S.byId[r.id] = { id: r.id, rule: r.id, set: set.name, name: r.name,
                     why: r.description, suggest: r.suggest,
                     off: r.default === 'off' ? (r.offBecause || 'no reason recorded') : null };
  }
}
async function loadBuiltins() {
  const m = await (await fetch('../rules/index.json')).json();
  for (const f of m.sets) {
    const set = await (await fetch('../rules/' + f)).json();
    S.setFile[set.name] = '../rules/' + f;
    addSet(set);
  }
  // candidates/ holds work in progress: style profiles nobody asked for, and a
  // record of patterns that measured backwards. They are worth keeping in the
  // repository and not worth putting in front of a visitor, who has no way to
  // tell them apart from the sets that ship.
}

/* worker — kept alive, so the timeout measures rule execution, not module load */
let worker = null, ready = null;
function spawn() {
  worker = new Worker('./worker.mjs', { type:'module' });
  ready = new Promise((res) => {
    const f = (e) => { if (e.data && e.data.ready) { worker.removeEventListener('message', f); res(); } };
    worker.addEventListener('message', f);
  });
}
async function ask(msg, ms = 5000) {
  if (!worker) spawn();
  await ready;
  return new Promise((resolve) => {
    const w = worker;
    const done = (v) => { w.removeEventListener('message', m); w.removeEventListener('error', x); clearTimeout(t); resolve(v); };
    const m = (e) => done(e.data), x = (e) => done({ ok:false, error:e.message });
    const t = setTimeout(() => {
      w.terminate(); if (worker === w) worker = null;
      done({ ok:false, error:`no result after ${ms/1000}s — a rule is backtracking` });
    }, ms);
    w.addEventListener('message', m); w.addEventListener('error', x); w.postMessage(msg);
  });
}

/* render */
// One document or many, this is the list to lint. With a single document the
// textarea stays the source of truth so edits take effect as you type.
function currentDocs() {
  if (S.docs.length > 1) return S.docs;
  const name = S.docs.length ? S.docs[0].name : S.name;
  return [{ name, kind: S.kind, src: $('input').value }];
}
const currentSrc = () => (currentDocs()[S.doc] || {}).src || '';

const note = (m) => { $('score').innerHTML = m ? `<span class="err">${esc(m)}</span>` : ''; };

// A rate reads as numbers, not as a sentence: the value it reached, the unit it
// is measured in, and the bound it crossed, each in its own place.
const OP_GLYPH = { '>=': '\u2265', '<=': '\u2264', '>': '>', '<': '<' };
const OP_WORDS = { '>=': (t, u) => `${t} ${u} or more`, '>': (t, u) => `more than ${t} ${u}`,
                   '<=': (t, u) => `${t} ${u} or less`, '<': (t, u) => `less than ${t} ${u}` };

function rateBlock(f) {
  const r = f.rate;
  if (!r) return `<div class="m">${esc(f.measure || f.name)}</div>`;
  // Three shapes: a rate per N words, a count over length^power, and the
  // variation measure, which is neither.
  // "per word^0.7" is the formula, not the meaning, and it told a reader
  // nothing. Say what the number is instead, and keep the arithmetic in the
  // tooltip for anyone who wants it.
  const unit = r.kind === 'variation' ? 'sentence-length variation'
    : r.power ? 'length-adjusted' : `per ${r.per} ${r.unit}`;
  // `count` is distinct matches when the rule counts distinct things, which is
  // every rule using an exponent, so "occurrences" was the wrong word for it.
  const sub = r.kind === 'variation' ? (r.detail || '')
    : r.power ? `${r.count} different ${r.unit} matched, in ${r.words} ${r.unit}`
    : `${r.count} occurrence${r.count === 1 ? '' : 's'} in ${r.words} words`;
  const words = (OP_WORDS[r.op] || ((t, u) => `${r.op} ${t} ${u}`))(r.threshold, unit);
  // No tooltip on this caption: a findings row already opens its own card on
  // hover, and two at once is worse than one that says less.
  return `<div class="rate"><b>${esc(String(r.value))}</b><span class="ru">${esc(unit)}</span>`
    + `<span class="rb" title="this rule reports at ${esc(words)}">`
    + `${OP_GLYPH[r.op] || esc(r.op)} ${esc(String(r.threshold))}</span></div>`
    + (sub ? `<div class="rsub">${esc(sub)}</div>` : '');
}

function marked(body, ranges, keepBlank) {
  // [start, end, findingIndex, class, priority]. A real span outranks a rate's
  // occurrence where the two overlap, so a flagged phrase is never hidden by
  // the evidence behind a measurement.
  //
  // This was a filter comparing each range against the PREVIOUS ELEMENT OF THE
  // INPUT rather than the last one kept, so a range dropped for overlapping
  // still acted as the boundary for the next one, which could then overlap the
  // range that was kept. The loop below then ran with a < last and re-emitted
  // text it had already written: "plainly shown it doesn't." appeared twice on
  // the page while the textarea underneath had it once, which is what made a
  // selection look duplicated and offset.
  //
  // Claim territory in priority order, then lay the survivors out in reading
  // order. Sorting by start first would have let an early low-priority
  // occurrence beat the flagged phrase the comment above promises to keep.
  const kept = [];
  for (const r of ranges.slice().sort((a, b) => a[4] - b[4] || a[0] - b[0]
                                                || (b[1] - b[0]) - (a[1] - a[0]))) {
    if (kept.some((k) => r[0] < k[1] && k[0] < r[1])) continue;
    kept.push(r);
  }
  const ok = kept.sort((a, b) => a[0] - b[0]);
  const out = [];
  let pos = 0;
  for (const line of body.split('\n')) {
    const s = pos, e = pos + line.length;
    pos = e + 1;
    if (!line.trim() && !keepBlank) continue;
    let html = '', last = s;
    for (const [rs, re, i, cls] of ok) {
      if (re <= s || rs >= e) continue;
      const a = Math.max(rs, s), b = Math.min(re, e);
      // Nothing may be emitted twice, whatever the ranges say.
      if (a < last || b <= a) continue;
      const c = `${cls || ''}${i === S.sel ? ' on' : ''}`.trim();
      html += esc(body.slice(last, a))
        + `<mark data-i="${i}"${c ? ` class="${c}"` : ''}>${esc(body.slice(a, b))}</mark>`;
      last = b;
    }
    out.push(`<p>${html + esc(body.slice(last, e)) || '<br>'}</p>`);
  }
  return out.join('');
}

function renderResults() {
  const res = $('results');
  if (S.mode === 'fudge') {
    res.hidden = false;
    // The rule set is the document and the test results are the findings, so
    // this keeps the split, the divider and the collapse arrows.
    $('views').hidden = $('nav').hidden = $('b-copy').hidden = true;
    $('copy-fallback').hidden = true;
    $('divider').hidden = false;
    $('panes').dataset.layout = S.layout === 'text' ? 'split' : S.layout;
    $('workspace').removeAttribute('data-multi');
    $('tree').hidden = true;
    renderFudge();
    return;
  }
  $('views').hidden = $('divider').hidden = false;
  res.hidden = false;
  // Empty is a normal state, not a hidden one: this block holds the surface you
  // type into, so it has to be on screen before there is anything to lint.
  if (!currentDocs().some((d) => d.src.trim())) {
    $('doc').innerHTML = '';
    $('list').innerHTML = '';
    $('r-title').textContent = '';
    $('list-head').textContent = 'findings';
    $('nav').hidden = $('b-copy').hidden = true;
    $('pane-doc').dataset.edit = 'on';
    return;
  }

  const results = S.results || [];
  const total = S.flat.length;
  const multi = results.length > 1;
  const useSrc = S.view === 'source';
  const srcs = currentDocs();
  tally();
  $('r-title').textContent = multi
    ? `${total} finding${total === 1 ? '' : 's'} in ${results.length} files`
    : (total ? `${total} finding${total === 1 ? '' : 's'}` : 'No findings');

  // Documents render in sequence so scrolling runs from one file straight into
  // the next, the way a diff view does.
  const byDoc = results.map(() => []);
  S.flat.forEach((f, gi) => byDoc[f.doc].push([f, gi]));

  // The surface is editable only when it shows what you typed, and only when
  // there is one document to type into. Several files, or the stripped prose,
  // and it becomes something to read rather than something to edit.
  $('pane-doc').dataset.edit = useSrc && !multi ? 'on' : 'off';
  $('doc').className = useSrc ? 'source' : 'prose';
  $('doc').innerHTML = results.map((r, di) => {
    const body = useSrc ? ((srcs[di] || {}).src || '') : r.text;
    const ranges = byDoc[di].flatMap(([f, gi]) => f.docLevel
      ? (f.occurrences || []).map((o) => useSrc ? [o.srcStart, o.srcEnd, gi, 'occ', 1]
                                                 : [o.start, o.end, gi, 'occ', 1])
      : [useSrc ? [f.srcStart, f.srcEnd, gi, '', 0] : [f.start, f.end, gi, '', 0]]);
    const head = multi ? `<h3 class="fname"><span class="nm">${esc(r.name)}</span>`
      + `<span class="ct${r.findings.length ? '' : ' clean'}">${r.findings.length || 'clean'}</span></h3>` : '';
    return `<section class="filesec" data-doc="${di}">${head}<div class="fbody">${marked(body, ranges, useSrc)}</div></section>`;
  }).join('');
  for (const m of $('doc').querySelectorAll('mark')) {
    const f = S.flat[+m.dataset.i];
    m.onclick = () => select(+m.dataset.i);
    m.onmouseenter = () => showTip(m, f);
    m.onmouseleave = hideTip;
  }

  $('list-head').textContent = total ? `${total} finding${total === 1 ? '' : 's'}` : 'findings';
  $('list').innerHTML = results.map((r, di) => {
    const rows = byDoc[di].map(([f, gi]) => `<li data-i="${gi}" class="${gi === S.sel ? 'on' : ''}${f.docLevel ? ' doclevel' : ''}">
        <span class="loc">${f.docLevel ? 'doc' : `${f.line}:${f.col}`}</span>
        <span><span class="rid">${esc(f.rule)}</span>${f.count && !f.docLevel ? ` <span class="loc cnt" title="${esc(f.measure || '')}">×${f.count}</span>` : ''}
          ${f.docLevel ? rateBlock(f) : `<div class="m">${esc(f.match)}</div>`}
          ${f.suggest ? `<div class="fix">${esc(f.suggest)}</div>` : ''}</span></li>`).join('');
    if (!multi) return rows;
    return `<li class="fgroup" data-doc="${di}">${esc(r.name)}</li>` + (rows || '<li class="none">no findings</li>');
  }).join('');
  for (const li of $('list').querySelectorAll('li[data-i]')) {
    const f = S.flat[+li.dataset.i];
    li.onclick = () => select(+li.dataset.i);
    li.onmouseenter = () => showTip(li, { ...S.byId[f.rule], measure: f.measure, rate: f.rate });
    li.onmouseleave = hideTip;
  }

  $('v-prose').setAttribute('aria-pressed', String(!useSrc));
  $('v-source').setAttribute('aria-pressed', String(useSrc));
  applyLayout();
  $('nav').hidden = !total;
  $('b-copy').hidden = !results.length;
  $('n-count').textContent = total ? (S.sel >= 0 ? `${S.sel + 1} / ${total}` : `– / ${total}`) : '';
  renderTree();
}

// The tree shows where you are, driven by the document pane's scroll: the last
// file that has started above a probe line near the top of the pane.
function currentDocFromScroll() {
  const probe = $('pane-doc').getBoundingClientRect().top + 60;
  let cur = 0;
  for (const sec of $('doc').querySelectorAll('.filesec')) {
    if (sec.getBoundingClientRect().top <= probe) cur = +sec.dataset.doc; else break;
  }
  return cur;
}

function markCurrentDoc(i, pin) {
  if (pin) S.pinned = Date.now() + 900;
  else if (Date.now() < (S.pinned || 0)) return;
  if (i === S.cur) return;
  S.cur = i;
  for (const b of $('tree').querySelectorAll('button.f')) {
    b.setAttribute('aria-current', String(+b.dataset.i === i));
  }
  const on = $('tree').querySelector('button.f[aria-current=true]');
  if (on) on.scrollIntoView({ block: 'nearest' });
}

// The copied object is the same shape the CLI writes with --format json, so it
// can be pasted wherever that output would go.
function resultJson() {
  const results = S.results || [];
  const files = results.map((r) => ({
    file: r.name,
    words: r.words,
    // The page carries offsets the CLI has no use for, on the finding and on
    // each occurrence. Strip both in place, keeping key order, so copied output
    // matches --format json.
    findings: r.findings.map((f) => {
      const out = { file: r.name };
      for (const [k, v] of Object.entries(f)) {
        if (k === 'srcStart' || k === 'srcEnd' || k === 'start' || k === 'end') continue;
        out[k] = k === 'occurrences'
          ? v.map(({ start, end, srcStart, srcEnd, ...o }) => o) : v;
      }
      return out;
    })
  }));
  const total = files.reduce((a, f) => a + f.findings.length, 0);
  const words = files.reduce((a, f) => a + f.words, 0);
  return JSON.stringify({
    files, total, words,
    per1000: words ? +(total / words * 1000).toFixed(2) : 0,
    rules: [...S.active]
  }, null, 2);
}

async function copyJson() {
  const text = resultJson();
  const btn = $('b-copy');
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = 'copied';
    btn.classList.add('done');
    setTimeout(() => { btn.textContent = 'copy JSON'; btn.classList.remove('done'); }, 1600);
  } catch {
    // No clipboard permission (or an insecure context): show it to copy by hand.
    const ta = $('copy-fallback');
    ta.value = text;
    ta.hidden = false;
    ta.focus();
    ta.select();
    btn.textContent = 'select and copy';
  }
}
$('b-copy').onclick = copyJson;

// One card for every hover surface: a mark in the document, a row in the
// findings list, a rule in the rule sets. It answers "what is this rule".
function showTip(el, info) {
  if (!info) return;
  const t = $('tip');
  t.innerHTML = `<div class="tip-head"><span class="rid">${esc(info.rule || info.id)}</span>`
    + `<span class="set">${esc(info.set || '')}</span></div>`
    + (info.name ? `<div class="tip-name">${esc(info.name)}</div>` : '')
    // What the ×N counts, which differs per rule: "no" items for a chain,
    // echoing sentences for an echo, questions in a row for a run.
    + (info.rate ? rateBlock(info)
       : info.measure ? `<div class="tip-count">${esc(info.measure)}</div>` : '')
    + (info.why ? `<div class="tip-why">${esc(info.why)}</div>` : '')
    + (info.suggest ? `<div class="tip-fix">${esc(info.suggest)}</div>` : '');
  t.classList.add('on');
  const r = el.getBoundingClientRect(), tr = t.getBoundingClientRect();
  t.style.left = Math.max(8, Math.min(r.left, innerWidth - tr.width - 8)) + 'px';
  t.style.top = (r.top > tr.height + 12 ? r.top - tr.height - 8 : r.bottom + 8) + 'px';
}
const hideTip = () => $('tip').classList.remove('on');

function select(i, scroll = true) {
  S.sel = i;
  const f = S.flat[i];
  renderResults();
  if (f) markCurrentDoc(f.doc, true);
  if (!scroll) return;
  // scrollIntoView targets the nearest scrolling ancestor, so this works for a
  // pane that scrolls on its own and for the page.
  const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  const m = $('doc').querySelector(`mark[data-i="${i}"]`);
  if (m && S.layout !== 'list') m.scrollIntoView({ block: 'center', behavior });
  const li = $('list').querySelector(`li[data-i="${i}"]`);
  if (li && S.layout !== 'text') li.scrollIntoView({ block: 'nearest', behavior });
}

const step = (d) => {
  if (!S.flat.length) return;
  select(S.sel < 0 ? (d > 0 ? 0 : S.flat.length - 1)
                   : (S.sel + d + S.flat.length) % S.flat.length);
};

function renderFudge() {
  const set = S.fudge && S.fudge.length ? S.fudge[0].set : null;
  $('r-title').textContent = set ? `Testing ${set}` : 'Testing your rules';
  $('doc').innerHTML = '';
  if (!S.fudge) { $('list-head').textContent = 'testing…'; $('list').innerHTML = ''; return; }

  const t = S.fudge.reduce((a, r) => ({ cok:a.cok+r.conform.ok, cbad:a.cbad+r.conform.fail,
    fok:a.fok+r.fudge.ok, fbad:a.fbad+r.fudge.fail, lossy:a.lossy+r.fudge.lossy }),
    {cok:0,cbad:0,fok:0,fbad:0,lossy:0});
  const bad = t.cbad + t.fbad;
  // The pane header carries the totals; a tally row inside the list only
  // repeated them and fought the list's own grid.
  $('list-head').innerHTML =
    `<span class="${bad ? 'bad' : ''}">${bad ? bad + ' failing' : 'all passing'}</span>`
    + `<span class="tot">${t.cok} examples · ${t.fok} variants</span>`;

  // Same shape as a finding: where it happened, what it was, why.
  // Source order, so the list reads down the same way the rule set does.
  $('list').innerHTML = S.fudge
    .map((r) => {
      const rb = r.conform.fail + r.fudge.fail;
      const ex = r.conform.ok + r.conform.fail;
      const mk = r.fudge.ok + r.fudge.fail;
      return `<li data-rule="${esc(r.rule)}" class="${rb ? 'bad' : 'good'}">
        <span class="loc">${rb ? '\u2715' : '\u2713'}</span>
        <span><span class="rid">${esc(r.rule)}</span>
${r.what ? `<div class="m">${esc(r.what)}</div>` : ''}
          <div class="counts">`
        + `<span class="${r.conform.fail ? 'x' : ''}">${r.conform.ok} of ${ex} example${ex === 1 ? '' : 's'}</span>`
        + (mk ? ` · <span class="${r.fudge.fail ? 'x' : ''}">${r.fudge.ok} of ${mk} markup variant${mk === 1 ? '' : 's'}</span>` : '')
        + `</div>
          ${r.failures.map((f) => `<div class="why" data-ex="${esc(String(f.detail))}"><b>${esc(f.kind)}</b> · ${esc(String(f.detail).slice(0, 140))}</div>`
            + (f.help ? `<div class="fix">${esc(f.help)}</div>` : '')).join('')}
        </span></li>`;
    }).join('');
  wireFudgeRows();
}

// The tree only exists for a multi-document load; a single file keeps the
// layout it had.
function renderTree() {
  const multi = (S.results || []).length > 1;
  const ws = $('workspace');
  ws.toggleAttribute('data-multi', multi);
  $('tree').hidden = $('tdivider').hidden = !multi;
  if (!multi) return;
  applyTree();
  let html = '<div class="thead">files</div>';
  let dir = null;
  S.results.forEach((r, i) => {
    const parts = r.name.split('/');
    const base = parts.pop();
    const d = parts.join('/');
    if (d !== dir) { dir = d; html += `<div class="dir">${esc(d || './')}</div>`; }
    const n = r.findings.length;
    html += `<button class="f${n ? '' : ' clean'}" data-i="${i}" aria-current="${i === S.cur}"
      title="${esc(r.name)}"><span class="nm">${esc(base)}</span><span class="ct">${n || '·'}</span></button>`;
  });
  if (S.skipped) html += `<div class="skipped">${S.skipped} file${S.skipped === 1 ? '' : 's'} skipped (not text)</div>`;
  $('tree').innerHTML = html;
  for (const b of $('tree').querySelectorAll('button.f')) b.onclick = () => scrollToDoc(+b.dataset.i);
}

// Jump to a file without leaving the continuous scroll.
function scrollToDoc(i) {
  markCurrentDoc(i, true);
  const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  const sec = $('doc').querySelector(`.filesec[data-doc="${i}"]`);
  if (sec && S.layout !== 'list') sec.scrollIntoView({ block: 'start', behavior });
  const grp = $('list').querySelector(`li.fgroup[data-doc="${i}"]`);
  if (grp && S.layout !== 'text') grp.scrollIntoView({ block: 'start', behavior });
}

// On test rules the lower-left holds a library instead of a switchboard. The
// page tests whatever is in the editor, so which sets are ticked on for
// checking is meaningless here -- the useful thing is to open a shipped set and
// read, fork or break it.
// Which sets read best as worked examples of writing a rule. The two derived
// sets are each a single generated pattern of a few hundred words, so they
// teach nothing about the format; these three are hand-written regexes with
// their own tests. Presentation only -- rules/index.json is generated, and
// alphabetical there is right for the switchboard on check.
const SHOWCASE = ['simonwillison', 'ai-tells', 'wikipedia-ai'];

function renderLibrary() {
  const el = $('rules');
  const rank = (set) => {
    const i = SHOWCASE.indexOf(set.name);
    return i === -1 ? SHOWCASE.length : i;
  };
  const shown = [...S.sets].sort((a, b) => rank(a) - rank(b));
  el.innerHTML = shown.map((set) => {
    const t = set.rules.reduce((a, r) => a + (r.tests ? (r.tests.hit || []).length + (r.tests.miss || []).length : 0), 0);
    return `<button class="libset" data-open="${esc(set.name)}">
      <span class="nm">${esc(set.title || set.name)}</span>
      <span class="cnt">${set.rules.length} ${set.rules.length === 1 ? 'rule' : 'rules'}${t ? ` &middot; ${t} examples` : ''}</span>
    </button>`;
  }).join('');
  $('load').innerHTML = `<div class="load">
      <input type="url" data-url placeholder="https://…/house-style.json">
      <div class="row"><button data-add>Open from URL</button><button data-file>Open a file</button></div>
      <div class="err" data-err></div></div>`;

  for (const b of el.querySelectorAll('button[data-open]')) {
    b.onclick = async () => {
      const url = S.setFile[b.dataset.open];
      if (!url) return;
      // The file, not a re-serialised parse: what you open is what ships.
      try {
        $('rules-src').value = await (await fetch(url)).text();
        run();
      } catch { el.querySelector('[data-err]').textContent = `Could not open ${url}.`; }
    };
  }
  const q = (sel) => $('load').querySelector(sel);
  q('[data-add]').onclick = async () => {
    const u = q('[data-url]').value.trim(); if (!u) return;
    try {
      const res = await fetch(u, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      $('rules-src').value = await res.text();
      q('[data-err]').textContent = ''; run();
    } catch (e) { q('[data-err]').textContent = e.message; }
  };
  q('[data-file]').onclick = () => pickFile('.json', async (file) => {
    $('rules-src').value = await file.text();
    q('[data-err]').textContent = ''; run();
  });
  $('rule-hint').textContent = `${S.sets.length} to open`;
}

function renderRules() {
  if (PAGE === 'rules') return renderLibrary();
  const counts = {};
  for (const f of S.flat) counts[f.rule] = (counts[f.rule] || 0) + 1;
  const el = $('rules');
  el.innerHTML = S.sets.map((set) => {
    const on = set.rules.filter((r) => S.active.has(r.id)).length;
    const hits = set.rules.reduce((a, r) => a + (counts[r.id] || 0), 0);
    const allOn = on === set.rules.length;
    return `<details class="rset"${S.setOpen[set.name] ? ' open' : ''} data-set="${esc(set.name)}">
      <summary>
        <input type="checkbox" class="setbox" data-toggle="${esc(set.name)}"
               ${allOn ? 'checked' : ''} aria-label="Turn ${esc(set.title || set.name)} on or off">
        <span class="nm">${esc(set.title || set.name)}</span>
        ${hits ? `<span class="hits">${hits}</span>` : ''}
        <span class="cnt">${on}/${set.rules.length}</span>
      </summary>
      <div class="rlist">${set.rules.map((r) => `<label data-rule-row="${esc(r.id)}">
        <input type="checkbox" data-rule="${esc(r.id)}"${S.active.has(r.id) ? ' checked' : ''}>
        <span class="id">${esc(r.id)}</span>${r.default === 'off' ? '<span class="offtag">off</span>' : ''}<span class="n">${counts[r.id] || ''}</span></label>`).join('')}</div>
    </details>`;
  }).join('');
  $('load').innerHTML = `<div class="load">
      <input type="url" data-url placeholder="https://…/house-style.json">
      <div class="row"><button data-add>Add from URL</button><button data-file>Add a file</button></div>
      <div class="err" data-err></div></div>`;

  const q = (sel) => $('load').querySelector(sel) || el.querySelector(sel);
  for (const d of el.querySelectorAll('details.rset')) {
    d.addEventListener('toggle', () => { S.setOpen[d.dataset.set] = d.open; });
  }
  for (const c of el.querySelectorAll('input[data-rule]')) {
    c.onchange = () => { c.checked ? S.active.add(c.dataset.rule) : S.active.delete(c.dataset.rule); run(); };
  }
  for (const row of el.querySelectorAll('label[data-rule-row]')) {
    row.onmouseenter = () => showTip(row, S.byId[row.dataset.ruleRow]);
    row.onmouseleave = hideTip;
  }
  for (const b of el.querySelectorAll('input[data-toggle]')) {
    const set = S.sets.find((x) => x.name === b.dataset.toggle);
    const on = set.rules.filter((r) => S.active.has(r.id)).length;
    // Partly on is a third state, and saying so is better than rounding it.
    b.indeterminate = on > 0 && on < set.rules.length;
    b.onclick = (e) => {
      // the box lives in a <summary>; do not let the click fold the block
      e.stopPropagation();
      const allOn = set.rules.every((r) => S.active.has(r.id));
      set.rules.forEach((r) => allOn ? S.active.delete(r.id) : S.active.add(r.id));
      run();
    };
  }
  q('[data-add]').onclick = async () => {
    const u = q('[data-url]').value.trim(); if (!u) return;
    try { await addRemoteSet(u); q('[data-err]').textContent = ''; run(); }
    catch (e) { q('[data-err]').textContent = e.message; }
  };
  q('[data-file]').onclick = () => pickFile('.json', async (file) => {
    try {
      const set = JSON.parse(await file.text());
      if (!Array.isArray(set.rules)) throw new Error('no "rules" array');
      set.name = set.name || file.name.replace(/\.json$/, '');
      addSet(set); q('[data-err]').textContent = ''; run();
    } catch (e) { q('[data-err]').textContent = e.message; }
  });
  const total = S.sets.reduce((a, s2) => a + s2.rules.length, 0);
  // The count lives in the panel header now; there is no button to label.
  $('rule-hint').textContent = `${S.active.size} of ${total} on`;
}

const TEXTY = /\.(md|markdown|mdown|mdx|html?|xhtml|txt|text|rst)$/i;
const kindOf = (n) => /\.(html?|xhtml)$/i.test(n) ? 'html'
                    : /\.(md|markdown|mdown|mdx)$/i.test(n) ? 'md' : 'txt';

// Everything that can arrive — a paste, one file, several, a folder, a zip —
// ends up as this same list, so the rest of the page has one shape to render.
function loadDocs(docs, skipped = 0) {
  S.docs = docs;
  S.skipped = skipped;
  S.doc = 0;
  S.cur = 0;
  S.sel = -1;
  if (docs.length === 1) { $('input').value = docs[0].src; S.kind = docs[0].kind; $('kind').value = S.kind; }
  grow();
  run();
}

async function filesToDocs(files) {
  const docs = [];
  let skipped = 0;
  for (const f of files) {
    const name = f.path || f.name;
    if (/\.zip$/i.test(name)) {
      try {
        for (const e of await readZip(await f.arrayBuffer())) {
          if (!TEXTY.test(e.name)) { skipped++; continue; }
          docs.push({ name: e.name, kind: kindOf(e.name), src: await e.text() });
        }
      } catch (err) { note(`${name}: ${err.message}`); }
      continue;
    }
    if (!TEXTY.test(name)) { skipped++; continue; }
    docs.push({ name, kind: kindOf(name), src: await f.text() });
  }
  docs.sort((a, b) => a.name.localeCompare(b.name));
  return { docs, skipped };
}

// A dropped folder arrives as a directory entry, not a file list.
async function entryToFiles(entry, out = [], prefix = '') {
  if (entry.isFile) {
    const f = await new Promise((res, rej) => entry.file(res, rej));
    f.path = prefix + f.name;
    out.push(f);
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    for (;;) {
      const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const e of batch) {
        if (e.name.startsWith('.')) continue;
        await entryToFiles(e, out, prefix + entry.name + '/');
      }
    }
  }
  return out;
}

function pickFile(accept, cb) {
  const i = Object.assign(document.createElement('input'), { type:'file', accept });
  i.onchange = () => i.files[0] && cb(i.files[0]);
  i.click();
}

// The textarea used to size itself to its content. It now fills the surface it
// shares with the highlighted copy, so there is nothing left to grow. The call
// sites are left alone because they read as "the text changed".
function grow() {}

/* run */
let timer = null;
function run() {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    renderRules();
    renderSay();
    // The card stays for a loaded set — the text area gives way to a summary,
    // so the rules control and the file picker never go out of reach.
    $('doc-tools').hidden = S.mode === 'fudge';
    document.body.dataset.mode = S.mode;
    $('rule-tools').hidden = S.mode !== 'fudge';
    $('views').hidden = S.mode === 'fudge';
    $('kind').hidden = S.mode === 'fudge';
    tally();
    if (S.mode === 'fudge') $('results').hidden = false;
    const many = S.docs.length > 1;
    // Several files have nothing single to type into; data-edit does the hiding.
    // Rules mode has no text to parse at all, so the choice goes either way.
    $('kind').hidden = many || S.mode === 'fudge';
    $('loaded').hidden = !many;
    if (many) {
      $('loaded').innerHTML = `<b>${S.docs.length} files</b> loaded`
        + (S.skipped ? ` · ${S.skipped} skipped (not text)` : '')
        + ` ${esc('—')} drop more to replace them`;
    }
    if (S.mode === 'fudge') {
      const { sets, err, pos } = readRuleSrc();
      $('rerr').hidden = !err;
      $('rerr').textContent = err || '';
      $('rerr').onclick = pos === null || pos === undefined ? null : () => {
        const ta = $('rules-src');
        ta.focus(); ta.setSelectionRange(pos, Math.min(pos + 1, ta.value.length));
        const lh = parseFloat(getComputedStyle(ta).lineHeight) || 20;
        ta.scrollTop = Math.max(0, (ta.value.slice(0, pos).split('\n').length - 1) * lh - ta.clientHeight / 3);
      };
      $('rmeta').textContent = sets.length ? `${sets[0].rules.length} rule${sets[0].rules.length === 1 ? '' : 's'}` : '';
      if (err || !sets.length) {
        S.fudge = null; $('score').textContent = ''; renderResults();
        // renderFudge says "testing…" while it waits; nothing is waiting here.
        $('list-head').textContent = err ? 'not run' : '';
        return;
      }
      S.fudge = null; renderResults();
      const res = await ask({ mode:'fudge', sets }, 60000);
      if (!res.ok) {
        S.fudge = null;
        $('rerr').hidden = false;
        $('rerr').onclick = null;
        $('rerr').textContent = res.error;
        $('score').textContent = '';
        $('list-head').textContent = 'not run';
        $('list').innerHTML = '';
        return;
      }
      S.fudge = res.results;
      renderSay();
      const bad = res.results.reduce((a,r) => a + r.conform.fail + r.fudge.fail, 0);
      $('score').className = 'score' + (bad ? '' : ' zero');
      $('score').innerHTML = `<b>${bad}</b> failing`;
      renderResults();
      tally();
      return;
    }
    const docs = currentDocs();
    if (!docs.some((d) => d.src.trim())) {
      S.results = []; S.flat = []; $('score').textContent = ''; $('meta').textContent = ''; tally(0);
      renderResults(); return;
    }
    const res = await ask({ mode:'check', docs, sets:S.sets, active:[...S.active] }, 20000);
    if (!res.ok) return note(res.error);
    S.results = res.results;
    // One list across every file, in document order, so next/prev and the
    // findings pane run straight through the whole set.
    S.flat = S.results.flatMap((r, doc) => r.findings.map((f) => ({ ...f, doc })));
    S.cur = Math.min(S.cur, Math.max(0, S.results.length - 1));
    S.sel = -1;
    const total = S.flat.length;
    const words = S.results.reduce((a, r) => a + r.words, 0);
    const per = words ? (total / words * 1000).toFixed(1) : '0.0';
    $('score').className = 'score' + (total ? '' : ' zero');
    $('score').innerHTML = `<b>${total}</b> · ${per}/1k`
      + (S.results.length > 1 ? ` · ${S.results.length} files` : '');
    $('meta').textContent = `${words} words`;
    tally(words);
    renderResults(); renderRules();
  }, 160);
}

// Every code block gets a copy button — the skill installer especially, which
// is meant to be pasted into a terminal or handed to an agent.
for (const pre of document.querySelectorAll('.docs pre, .guide pre')) {
  const btn = document.createElement('button');
  btn.className = 'copy-pre';
  btn.type = 'button';
  btn.textContent = 'copy';
  btn.title = 'Copy this block';
  btn.onclick = async () => {
    // innerText, not textContent: it keeps the line breaks the block shows.
    const text = [...pre.childNodes].filter((n) => n !== btn).map((n) => n.textContent).join('').trim();
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'copied';
    } catch {
      const r = document.createRange();
      r.selectNodeContents(pre);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      btn.textContent = 'select all — ⌘C';
    }
    btn.classList.add('done');
    setTimeout(() => { btn.textContent = 'copy'; btn.classList.remove('done'); }, 1600);
  };
  pre.appendChild(btn);
}

/* wiring */
$('input').addEventListener('input', () => { $('copy-fallback').hidden = true; run(); });
// The highlighted copy sits over the textarea, so the two must scroll together
// or the marks drift off the words they belong to.
$('input').addEventListener('scroll', () => {
  $('doc').scrollTop = $('input').scrollTop;
  $('doc').scrollLeft = $('input').scrollLeft;
});
$('kind').addEventListener('change', () => { S.kind = $('kind').value; run(); });
$('v-prose').onclick = () => { S.view = 'prose'; renderResults(); };
$('v-source').onclick = () => { S.view = 'source'; renderResults(); };
$('n-prev').onclick = () => step(-1);
$('n-next').onclick = () => step(1);

// The divider is the layout control: drag it, or step it left and right to
// collapse a side. Order runs findings-only <- split -> text-only.
const ORDER = ['list', 'split', 'text'];
function applyLayout() {
  const panes = $('panes');
  panes.dataset.layout = S.layout;
  panes.style.setProperty('--split', S.split + '%');
  const i = ORDER.indexOf(S.layout);
  $('d-left').disabled = i <= 0;
  $('d-right').disabled = i >= ORDER.length - 1;
  $('grip').setAttribute('aria-valuenow', Math.round(S.split));
}
function setLayout(l) {
  S.layout = l;
  remember('pc-layout', l);
  applyLayout();
  if (S.sel >= 0) select(S.sel);
}
const stepLayout = (d) => {
  const i = ORDER.indexOf(S.layout) + d;
  if (i >= 0 && i < ORDER.length) setLayout(ORDER[i]);
};
// The file list collapses the same way the panes do.
function applyTree() {
  const ws = $('workspace');
  ws.dataset.tree = S.tree;
  ws.style.setProperty('--tree', S.treeW + 'px');
  $('t-left').disabled = S.tree === 'closed';
  $('t-right').disabled = S.tree === 'open';
}
function setTree(state) { S.tree = state; remember('pc-tree', state); applyTree(); }
$('t-left').onclick = () => setTree('closed');
$('t-right').onclick = () => setTree('open');

let tdrag = false;
$('tgrip').addEventListener('pointerdown', (e) => {
  if (innerWidth <= 820) return;
  tdrag = true; document.body.classList.add('resizing');
  try { $('tgrip').setPointerCapture(e.pointerId); } catch {}
});
addEventListener('pointermove', (e) => {
  if (!tdrag) return;
  const left = $('workspace').getBoundingClientRect().left;
  S.treeW = Math.max(120, Math.min(420, e.clientX - left));
  if (S.tree !== 'open') S.tree = 'open';
  applyTree();
});
for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, () => {
  if (!tdrag) return;
  tdrag = false; document.body.classList.remove('resizing');
  remember('pc-treew', S.treeW); remember('pc-tree', S.tree);
});
$('tgrip').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') { e.preventDefault(); S.treeW = Math.max(120, S.treeW - 20); applyTree(); remember('pc-treew', S.treeW); }
  if (e.key === 'ArrowRight') { e.preventDefault(); S.treeW = Math.min(420, S.treeW + 20); applyTree(); remember('pc-treew', S.treeW); }
});

$('d-left').onclick = () => stepLayout(-1);
$('d-right').onclick = () => stepLayout(1);

function setSplit(pct) {
  S.split = Math.max(20, Math.min(80, pct));
  if (S.layout !== 'split') { S.layout = 'split'; remember('pc-layout', 'split'); }
  applyLayout();
}
let dragging = false;
$('grip').addEventListener('pointerdown', (e) => {
  if (innerWidth <= 820) return;
  dragging = true;
  document.body.classList.add('resizing');
  try { $('grip').setPointerCapture(e.pointerId); } catch {}
});
addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const r = $('panes').getBoundingClientRect();
  setSplit((e.clientX - r.left) / r.width * 100);
});
for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, () => {
  if (!dragging) return;
  dragging = false;
  document.body.classList.remove('resizing');
  remember('pc-split', S.split);
});
$('grip').addEventListener('dblclick', () => { setSplit(60); remember('pc-split', 60); });
$('grip').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') { e.preventDefault(); setSplit(S.split - 4); remember('pc-split', S.split); }
  if (e.key === 'ArrowRight') { e.preventDefault(); setSplit(S.split + 4); remember('pc-split', S.split); }
  if (e.key === 'Home') { e.preventDefault(); setLayout('list'); }
  if (e.key === 'End') { e.preventDefault(); setLayout('text'); }
});

/* A result points back at the text that produced it, the way a finding points
   at a line. Clicking a rule selects that rule in the editor; clicking the
   reason selects the exact example string that failed. */
function selectInRules(needle) {
  const ta = $('rules-src');
  const i = ta.value.indexOf(needle);
  if (i < 0) return;
  ta.focus();
  ta.setSelectionRange(i, i + needle.length);
  // Textareas do not scroll to a selection on their own. Measure a line and
  // put the match a third of the way down the visible area.
  const line = parseFloat(getComputedStyle(ta).lineHeight) || 20;
  const before = ta.value.slice(0, i).split('\n').length - 1;
  ta.scrollTop = Math.max(0, before * line - ta.clientHeight / 3);
}

// The whole rule object, found from its id, so clicking a row shows the rule
// rather than two words of it.
function ruleBlock(id) {
  const src = $('rules-src').value;
  const at = src.search(new RegExp('"id"\\s*:\\s*"' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"'));
  if (at < 0) return null;
  let start = src.lastIndexOf('{', at);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  return null;
}

function wireFudgeRows() {
  for (const row of $('list').querySelectorAll('li[data-rule]')) {
    row.onclick = (e) => {
      for (const o of $('list').querySelectorAll('li.on')) o.classList.remove('on');
      row.classList.add('on');
      const why = e.target.closest('.why');
      if (why && why.dataset.ex) return selectInRules(why.dataset.ex);
      const block = ruleBlock(row.dataset.rule);
      if (block) selectInRules(block);
    };
  }
}

/* ---- test-rules mode: the user's own set, tested here ------------------- */
const RULE_TEMPLATE = "{\n  \"name\": \"my-rules\",\n  \"version\": \"0.1.0\",\n  \"rules\": [\n    {\n      \"id\": \"utilise\",\n      \"name\": \"\\\"utilise\\\" for \\\"use\\\"\",\n      \"match\":   { \"kind\": \"regex\", \"pattern\": \"\\\\butili[sz]e[sd]?\\\\b\", \"flags\": \"gi\" },\n      \"notable\": { \">\": 0 },\n      \"description\": \"Formal where plain would do.\",\n      \"suggest\": \"Write \\\"use\\\".\",\n      \"tests\": {\n        \"hit\":  [\"We utilise the cache for this.\"],\n        \"miss\": [\"The utility ran overnight.\"]\n      }\n    },\n    {\n      \"id\": \"very\",\n      \"name\": \"\\\"very\\\"\",\n      \"match\":   { \"kind\": \"regex\", \"pattern\": \"very\", \"flags\": \"gi\" },\n      \"notable\": { \">\": 0 },\n      \"description\": \"An intensifier that weakens the word after it.\",\n      \"suggest\": \"Cut it, or pick a stronger word.\",\n      \"tests\": {\n        \"hit\":  [\"The import step was very slow.\"],\n        \"miss\": [\"Every request is logged to disk.\"]\n      }\n    }\n  ]\n}";

function readRuleSrc() {
  const raw = $('rules-src').value.trim();
  if (!raw) return { sets: [], err: null };
  let json;
  try { json = JSON.parse(raw); }
  catch (e) {
    // The engine's message carries a character offset. A line number is more
    // use, and the cursor going there is more use still.
    const at = /position (\d+)/.exec(e.message);
    const pos = at ? Math.min(+at[1], raw.length) : null;
    const line = pos === null ? null : raw.slice(0, pos).split('\n').length;
    return { sets: [], pos,
      err: (line ? `Line ${line}: ` : '') + e.message.replace(/ in JSON at position.*$/, '')
        + '. JSON allows no trailing comma after the last item, and every key and'
        + ' string must use double quotes.' };
  }
  const set = Array.isArray(json) ? { name: 'my-rules', rules: json } : json;
  if (!Array.isArray(set.rules)) return { sets: [], err: 'A rule set needs a "rules" array.' };
  // An id addresses a rule everywhere, so two rules cannot share one. Checked
  // here as well as in the engine, to answer while you are still typing.
  const seen = new Map();
  for (const r of set.rules) if (r && r.id) seen.set(r.id, (seen.get(r.id) || 0) + 1);
  const dupes = [...seen].filter(([, n]) => n > 1);
  if (dupes.length) {
    return { sets: [], err: 'Every rule needs its own id, but '
      + dupes.map(([id, n]) => `"${id}" appears ${n} times`).join(', ')
      + '. An id is how a rule is selected, ignored and reported, so it has to be unique.' };
  }
  const noId = set.rules.findIndex((r) => !r || !r.id);
  if (noId >= 0) return { sets: [], err: `Rule ${noId + 1} has no "id". Every rule needs one.` };
  set.name = set.name || 'my-rules';
  return { sets: [set], err: null };
}

$('b-rreset').onclick = () => { $('rules-src').value = RULE_TEMPLATE; run(); };
$('b-rfile').onclick = () => pickFile('.json', async (file) => {
  $('rules-src').value = await file.text(); run();
});
$('rules-src').addEventListener('input', run);
$('rules-src').value = RULE_TEMPLATE;

$('b-example').onclick = () => {
  $('kind').value = S.kind = 'md';
  S.name = 'example.md';
  $('input').value = `# Why we deleted the retry loop

Last month a customer asked where three days of events had gone. They had not
gone anywhere. They had been retried into a socket nobody was reading, and the
loop doing it had been in the ingest path since the first week of the project.

Nobody defended it and nobody removed it, so it sat there quietly, load-bearing
in the way undocumented code becomes load-bearing: not because anyone showed it
works, but because nothing had plainly shown it doesn't.

## What it was doing

The loop wrapped a single call to the storage client. On any exception it slept,
doubled the delay, and tried again, up to ten times. That is a reasonable thing
to write in an afternoon and a hazard to leave in place for three years.

The first problem is the ordinary one: it retried errors that were never going
to succeed. A malformed record came back with the same validation failure ten
times, eleven seconds apart, and was then dropped without a line in the log.

The second problem is the one that cost us. The caller upstream had a deadline
of its own — two seconds, set in a config file somebody wrote in 2023 and
nobody has read since. By the third attempt the loop was writing into a request
that had already been answered and closed. The write failed, and the failure
went nowhere: the loop swallowed it, the caller had moved on, and the counter
everyone watched was counting attempts rather than successes.

Turns out the loop had never helped a single request. It had only ever made the
graph look calm. Patience is indistinguishable from health until somebody reads
the numbers underneath it.

## Why nobody caught it

The ingest dashboard had one graph and it stood at green for twelve consecutive
days while this was happening. It plotted writes attempted per minute, and
attempts were exactly what the loop manufactured. A record that failed ten times
arrived on that graph as ten healthy-looking writes. The worse the day, the
better the line.

Nobody was told, because there was nothing to tell. The loop did not warn, did
not log, and did not increment anything a human had ever looked at. No flags, no
alerting, no dead-letter queue. That is the whole point of a retry: it buys time
against a problem that will pass, and it hides one that will not.

We only found it because a customer counted their own records and we could not
match the number. Half a day of reading the client library, and the loop was
plainly the only thing between the write and the socket.

## What we changed

The fix needed three things: a deadline the caller owns, one place that decides,
and a test that survives a rerun.

The deadline moved up the stack. A caller that cannot wait four seconds now says
so, and the storage client honours the budget it is given instead of inventing
one. Errors are sorted once, in one function, into the ones worth repeating and
the ones worth reporting. And the ingest path no longer swallows anything: when
a write fails, it fails loudly and names the record.

Ten call sites needed no change at all. Two of them disagreed with the new
deadline strongly enough that somebody had to make a judgement call, and that
judgement is filed in the design note beside the assumption it rests on.

## What it cost

The extra noise is real, and it's not subtle. Moving failures from silent to
loud turned roughly four per cent of ingest errors into pages, and the on-call
rota felt every one of them in the first week. That's not nothing.

But a page that fires is worth more than a graph that lies, and the pages have
already found two upstream defects that the old path had been hiding for
months. That's the part a dashboard could never reach.

You don't have to take my word for the reproducibility. The replay harness is
checked in: point it at a fixed offset, run it twice, and compare the output.
It is byte-identical, which is precisely the property the old path could never
assert, because its behaviour depended on how long a socket happened to survive.

## What we left alone

We did not touch the backoff schedule, the queue, or the client library's own
timeouts. Three things changed and no more, which is what made the rollback plan
one revert and the review a single afternoon. The temptation to fix the two
upstream defects in the same change was real, and we filed them instead.

The punchline is that nobody noticed the loop for three years, and everybody
noticed its absence in a day.`;
  grow(); run();
};
$('b-file').onclick = () => {
  const i = Object.assign(document.createElement('input'), {
    type: 'file', multiple: true,
    accept: '.md,.markdown,.mdx,.html,.htm,.txt,.text,.rst,.zip'
  });
  i.onchange = async () => {
    const { docs, skipped } = await filesToDocs([...i.files]);
    if (!docs.length) return note(`nothing to lint — ${skipped} file${skipped === 1 ? '' : 's'} skipped (not text)`);
    loadDocs(docs, skipped);
  };
  i.click();
};
// The whole page is a drop target, so you never have to aim.
let depth = 0;
addEventListener('dragenter', (e) => { e.preventDefault(); if (++depth === 1) document.body.classList.add('dragging'); });
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; document.body.classList.remove('dragging'); } });
addEventListener('drop', async (e) => {
  e.preventDefault(); depth = 0; document.body.classList.remove('dragging');
  const items = [...(e.dataTransfer.items || [])];
  const dropped = [...e.dataTransfer.files];
  if (!dropped.length) return;

  // A single rule set is configuration, not a document.
  if (dropped.length === 1 && /\.json$/i.test(dropped[0].name)) {
    try {
      const set = JSON.parse(await dropped[0].text());
      set.name = set.name || dropped[0].name.replace(/\.json$/, '');
      addSet(set); run();
    } catch (err) { note(err.message); }
    return;
  }

  let files = dropped;
  const entries = items.map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  if (entries.some((en) => en.isDirectory)) {
    files = [];
    for (const en of entries) await entryToFiles(en, files);
  }
  const { docs, skipped } = await filesToDocs(files);
  if (!docs.length) return note(`nothing to lint — ${skipped} file${skipped === 1 ? '' : 's'} skipped (not text)`);
  loadDocs(docs, skipped);
});
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  if (!S.flat.length) return;
  if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); step(1); }
  if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
});
addEventListener('scroll', hideTip, true);
let scrollTick = null;
$('pane-doc').addEventListener('scroll', () => {
  if (scrollTick) return;
  scrollTick = requestAnimationFrame(() => { scrollTick = null; markCurrentDoc(currentDocFromScroll()); });
});

await loadBuiltins();
// run() is debounced, so the panel would sit empty for a moment on first load.
renderSay();
await readHash();
S.kind = $('kind').value = S.kind;
grow(); run();
