/* Definitions on hover, and on tap.
 *
 * These were `title` attributes, which failed twice over. The page's escaper
 * did not escape quotes, and the definition of "signed" quotes a footer
 * verbatim -- "Generated with Claude Code" -- so the attribute ended at that
 * first quote and took the rest of the sentence with it. And a native tooltip
 * waits about a second, never fires on a touch screen, and cannot be styled,
 * which is three reasons it was the wrong mechanism for a word the reader has
 * to look up to follow the sentence.
 *
 * Opt in with data-tip. Shared by all three pages.
 */
const tip = document.createElement('div');
tip.className = 'tip';
tip.setAttribute('role', 'tooltip');
tip.hidden = true;
document.body.append(tip);

let anchor = null;

function place(el) {
  const r = el.getBoundingClientRect();
  tip.hidden = false;
  const t = tip.getBoundingClientRect();
  const pad = 8;
  // Prefer below; flip above when there is no room. Clamp horizontally so a
  // term near either edge keeps the whole definition on screen.
  const below = r.bottom + pad + t.height <= innerHeight;
  tip.style.top = `${below ? r.bottom + pad : Math.max(pad, r.top - pad - t.height)}px`;
  tip.style.left = `${Math.min(Math.max(pad, r.left), innerWidth - t.width - pad)}px`;
}

function show(el) {
  const text = el.dataset.tip;
  if (!text) return;
  anchor = el;
  tip.textContent = text;
  tip.style.left = '0px';
  tip.style.top = '0px';
  place(el);
  el.setAttribute('aria-describedby', 'tip');
}
function hide() {
  if (anchor) anchor.removeAttribute('aria-describedby');
  anchor = null;
  tip.hidden = true;
}
tip.id = 'tip';

const of = (e) => e.target.closest?.('[data-tip]');

// Delegated, because every one of these terms is written into the page by a
// render that runs again whenever the data or the selection changes.
document.addEventListener('pointerover', (e) => {
  if (e.pointerType === 'touch') return;
  const el = of(e);
  if (el) show(el); else if (anchor && !tip.contains(e.target)) hide();
});
document.addEventListener('pointerout', (e) => {
  if (e.pointerType === 'touch') return;
  const el = of(e);
  if (el && el === anchor && !el.contains(e.relatedTarget)) hide();
});
// A tap toggles: on a touch screen there is no hover to leave.
document.addEventListener('click', (e) => {
  const el = of(e);
  if (el) { e.preventDefault(); el === anchor ? hide() : show(el); }
  else if (!tip.contains(e.target)) hide();
});
document.addEventListener('focusin', (e) => { const el = of(e); if (el) show(el); });
document.addEventListener('focusout', (e) => { if (of(e) === anchor) hide(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
addEventListener('scroll', () => { if (anchor) place(anchor); }, true);
addEventListener('resize', () => { if (anchor) place(anchor); });
