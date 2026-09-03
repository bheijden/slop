// The part of every page that is the same: the theme switch, and the rail.
// Each page says which destination it is and what standing context to show;
// nothing else here knows anything about check, rules or vocabulary.

const ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ctext y='25' font-size='26' font-family='Georgia,serif' fill='%23C2403C'%3E%C2%B6%3C/text%3E%3C/svg%3E";

export const DESTS = [
  { id: 'check', href: './', k: '1', label: 'check', note: 'lint some prose' },
  { id: 'rules', href: 'rules.html', k: '2', label: 'test rules', note: 'try a rule set' },
  { id: 'vocabulary', href: 'vocabulary.html', k: '3', label: 'vocabulary', note: 'where the words come from' },
];

/** Fill the rail. `context` is the page's own markup for the middle section. */
export function rail(here, context = '') {
  const el = document.querySelector('.rail');
  el.innerHTML = `
    <div class="brand">
      <a href="./">slop<b>.</b></a>
      <p>a linter for prose</p>
    </div>
    <nav class="dest">
      ${DESTS.map((d) => `<a href="${d.href}"${d.id === here ? ' aria-current="page"' : ''}>
        <span class="k">${d.k}</span><span>${d.label}</span></a>`).join('')}
    </nav>
    <div class="context">${context}</div>
    <div class="railfoot">
      <button class="chip" id="theme" title="Light, dark, or whatever the system says">auto</button>
      <span class="spacer" style="flex:1"></span>
      <a href="https://github.com/bheijden/slop">source</a>
    </div>`;
  wireTheme();
  // The destinations are reachable by number, which is worth having when the
  // three pages are meant to feel like one bench.
  addEventListener('keydown', (e) => {
    const t = e.target;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const d = DESTS.find((x) => x.k === e.key);
    if (d && d.id !== here) location.href = d.href;
  });
}

/** Replace the rail's middle section without rebuilding the rest. */
export function context(html) {
  const el = document.querySelector('.rail .context');
  if (el) el.innerHTML = html;
}

function wireTheme() {
  const b = document.getElementById('theme');
  if (!b) return;
  const set = (v) => {
    if (v === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', v);
    b.textContent = v;
    try { localStorage.setItem('slop-theme', v); } catch (e) { /* private window */ }
  };
  let saved = 'auto';
  try { saved = localStorage.getItem('slop-theme') || 'auto'; } catch (e) { /* ditto */ }
  set(saved);
  b.onclick = () => set({ auto: 'light', light: 'dark', dark: 'auto' }[b.textContent] || 'auto');
}

/** The <head> bits every page repeats. Called before anything renders. */
export function head(title, description) {
  document.title = `slop · ${title}`;
  const add = (tag, attrs) => {
    const e = document.createElement(tag);
    Object.assign(e, attrs);
    document.head.appendChild(e);
  };
  add('link', { rel: 'icon', href: ICON });
  if (description) add('meta', { name: 'description', content: description });
}
