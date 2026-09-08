#!/usr/bin/env node
// The cluster selector, against the case that broke it.
//
// On 2026-09-07 the weekly fit published a front-end styling cluster: 39.0%
// signed, top words "pill inset tapping painted tall wordmark". The register
// came second at 34.7% with "pullrequest refusal ruling refused vacuous arms".
// Signature share alone picked the wrong one by 4.3 points, and the only thing
// that caught it was the rule failing its own hit example, which blocked the
// commit and turned the run red.
//
// Front-end work is heavily agent-assisted, so its descriptions carry
// signatures without being the register -- the failure recorded in
// research/load-bearing-labels.md for WebKit's build tooling at 53% signed,
// now close enough to the top to win.
//
// This runs the tie-break in isolation, on those numbers.

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}   ${name}${ok || !detail ? '' : `  — ${detail}`}`);
  if (!ok) failed++;
};

const NEAR = 0.10;

// The selector as pr-cluster.mjs runs it, over plain word lists.
function pick(clusters, previous) {
  const best = clusters.reduce((b, x) => (!b || x.stamped > b.stamped ? x : b));
  const close = clusters.filter((x) => best.stamped - x.stamped <= NEAR);
  if (close.length <= 1 || !previous.size) return best;
  const kept = (x) => x.words.filter((w) => previous.has(w)).length;
  return close.reduce((b, x) => (kept(x) > kept(b) ? x : b), close[0]);
}

// The words the rule carried that week, abbreviated to the ones that matter.
const shipped = new Set(['nobody', 'quietly', 'nowhere', 'halves', 'survived', 'rung', 'arms',
  'handed', 'load-bearing', 'somebody', 'refused', 'precisely', 'worse', 'refusal',
  'indistinguishable', 'plainly', 'decides', 'asserted', 'outright', 'ruling', 'vacuous',
  'pullrequest']);

const styling = { name: 'front-end styling', stamped: 0.390,
  words: ['pill', 'inset', 'tapping', 'painted', 'tall', 'wordmark', 'taller', 'chip', 'glyph',
          'scrolled', 'paints', 'centred', 'rail', 'colour', 'glyphs', 'popover'] };
const register = { name: 'the register', stamped: 0.347,
  words: ['pullrequest', 'refusal', 'ruling', 'refused', 'vacuous', 'arms', 'nobody', 'plainly',
          'outright', 'quietly', 'somebody', 'halves'] };
const airbyte = { name: 'airbyte', stamped: 0.114,
  words: ['airbyte', '--pull', 'up_to_date', 'airbyte-ci', 'syft'] };

console.log('the fit that broke it, 2026-09-07:');
check('signature share alone picks the styling cluster',
  [styling, register, airbyte].reduce((b, x) => (x.stamped > b.stamped ? x : b)).name
    === 'front-end styling');
check('and the tie-break picks the register instead',
  pick([styling, register, airbyte], shipped).name === 'the register',
  pick([styling, register, airbyte], shipped).name);

console.log('\na week where the share chooses clearly:');
const clear = [{ name: 'the register', stamped: 0.408, words: [...shipped] },
               { name: 'other', stamped: 0.187, words: ['airbyte', 'syft'] }];
check('the tie-break does not fire, and the top share wins',
  pick(clear, shipped).name === 'the register');
// The anchor must not be able to hold a cluster that has genuinely fallen away.
check('a distant cluster cannot win on overlap alone',
  pick([{ name: 'far', stamped: 0.10, words: [...shipped] },
        { name: 'near', stamped: 0.40, words: ['x', 'y'] }], shipped).name === 'near');

console.log('\nwith no previous list:');
check('it falls back to the highest share',
  pick([styling, register, airbyte], new Set()).name === 'front-end styling');

console.log(failed ? `\ncluster selector: ${failed} failed` : '\ncluster selector: all hold');
process.exit(failed ? 1 : 0);
