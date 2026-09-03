/* The install sheet.
 *
 * How to run slop is the one thing every page needs and no page has room for.
 * It lives behind a button next to the theme toggle, so it is reachable from
 * check, test rules and vocabulary without any of them giving up a panel.
 *
 * Self-contained on purpose: index and rules load app.mjs, vocabulary has its
 * own inline script, and this has to work on all three without joining either.
 */
const REPO = 'https://github.com/bheijden/slop';

const BLOCKS = [
  {
    h: 'Run it once',
    p: 'Nothing installed. Needs only Node.',
    cmd: 'npx --yes github:bheijden/slop check docs/ -r',
  },
  {
    h: 'Run it often',
    p: 'A clone starts about 25&times; faster. No dependencies.',
    cmd: 'git clone --depth 1 https://github.com/bheijden/slop\nnode slop/js/cli.mjs check docs/ -r',
  },
  {
    h: 'Fail a build on it',
    p: 'Findings never fail a run on their own. Set a budget when they should.',
    cmd: 'slop check --max-per-1000 2 docs/ -r\nslop check --format json docs/ -r',
  },
  {
    h: 'Give it to a coding agent',
    p: 'The agent then runs it by itself whenever it writes prose for you. '
     + 'About 100 tokens to have installed; the body loads only when it triggers.',
    cmd: 'D=~/.claude/skills/linting-prose\n'
       + 'R=https://raw.githubusercontent.com/bheijden/slop/main/skill\n'
       + 'mkdir -p $D/reference\n'
       + 'curl -sL $R/SKILL.md -o $D/SKILL.md\n'
       + 'for f in rules authoring; do curl -sL $R/reference/$f.md -o $D/reference/$f.md; done',
  },
  {
    h: 'Or let it install itself',
    p: 'Hand this to the agent instead.',
    cmd: 'Install the slop skill from github.com/bheijden/slop/tree/main/skill\n'
       + 'into ~/.claude/skills/linting-prose/, keeping the reference/ files.',
  },
  {
    h: 'Update an earlier install',
    p: 'Also for the agent. Rule format changed: a rule now carries "match" and "notable".',
    cmd: 'Update my slop install from github.com/bheijden/slop. Pull the clone if I\n'
       + 'have one, and re-copy skill/SKILL.md and skill/reference/*.md over\n'
       + '~/.claude/skills/linting-prose/. Migrate any rule sets under .slop/rules/\n'
       + 'and run: slop test-rules <file>',
  },
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const btn = document.createElement('button');
btn.className = 'themer sheeter';
btn.id = 'installer';
btn.title = 'How to install and run it';
btn.setAttribute('aria-label', 'How to install and run it');
btn.innerHTML = `<svg viewBox="0 0 20 20" aria-hidden="true">
  <path d="M4 6.5L7.5 10 4 13.5"/><path d="M10.5 14h5.5"/></svg>`;

const dlg = document.createElement('dialog');
dlg.className = 'sheet';
dlg.innerHTML = `
  <form method="dialog" class="sheet-x"><button aria-label="Close">&times;</button></form>
  <h2>Install and run</h2>
  <p class="sheet-lead">A prose linter that runs anywhere Node does. The page you are on
    is the same engine, and nothing you paste into it leaves your browser.</p>
  ${BLOCKS.map((b) => `<section class="sheet-b">
    <h3>${esc(b.h)}</h3>
    <p>${b.p}</p>
    <div class="sheet-c"><pre>${esc(b.cmd)}</pre><button class="cp" data-cp>Copy</button></div>
  </section>`).join('')}
  <p class="sheet-foot"><a href="${REPO}#readme">Read the full documentation</a> &middot;
    <a href="${REPO}/blob/main/docs/skill.md">the agent skill</a> &middot;
    <a href="${REPO}/blob/main/docs/rules.md">the rule format</a></p>`;

document.body.append(btn, dlg);
btn.onclick = () => dlg.showModal();
// Clicking the backdrop closes it. The dialog fills its own box, so a click
// whose target is the dialog itself landed outside the content.
dlg.onclick = (e) => { if (e.target === dlg) dlg.close(); };
for (const c of dlg.querySelectorAll('[data-cp]')) {
  c.onclick = async () => {
    try {
      await navigator.clipboard.writeText(c.previousElementSibling.textContent);
      c.textContent = 'Copied';
    } catch { c.textContent = 'Press ⌘C'; }
    setTimeout(() => { c.textContent = 'Copy'; }, 1400);
  };
}
