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
// This runs the selection rule in isolation, on those numbers.

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}   ${name}${ok || !detail ? '' : `  — ${detail}`}`);
  if (!ok) failed++;
};

// The rule as tools/pr-fit.mjs applies it: sweep k, keep the fits where the
// signature and growth selectors land on the same cluster, and take the one
// whose signature share is furthest clear of its runner-up.
const judge = (cs) => {
  const signature = cs.reduce((b, x) => (x.stamped > b.stamped ? x : b));
  const runnerUp = cs.filter((x) => x !== signature)
    .reduce((b, x) => (!b || x.stamped > b.stamped ? x : b), null);
  const grew = cs.filter((x) => x.arrived);
  const growth = grew.length ? grew.reduce((b, x) => (x.end > b.end ? x : b)) : null;
  return { signature, growth, agree: !!growth && growth.name === signature.name,
           gap: runnerUp ? signature.stamped - runnerUp.stamped : 1 };
};
const choose = (fits) => {
  const agreed = fits.map((f) => ({ ...judge(f.clusters), k: f.k })).filter((j) => j.agree);
  return agreed.length ? agreed.reduce((b, j) => (j.gap > b.gap ? j : b)) : null;
};

// 2026-09-07, k=10, from the run that failed. The styling cluster leads on
// signature; the register is the largest of recent weeks. `end` values are the
// share of recent weeks the run reported.
const styling = { name: 'front-end styling', stamped: 0.390, end: 0.205, arrived: true };
const register = { name: 'the register', stamped: 0.347, end: 0.423, arrived: true };
const airbyte = { name: 'airbyte', stamped: 0.114, end: 0.245, arrived: true };
const monday = { k: 10, clusters: [styling, register, airbyte] };

console.log('the fit that broke it, 2026-09-07 at k=10:');
const j = judge(monday.clusters);
check('signature alone picks the styling cluster', j.signature.name === 'front-end styling');
check('the growth test picks the register', j.growth.name === 'the register');
check('so they disagree, and that fit publishes nothing', !j.agree);

console.log('\nsweeping, with one fit that agrees:');
// k=8 on the same archive: one cluster leads on both, clear of its runner-up.
const good = { k: 8, clusters: [
  { name: 'the register', stamped: 0.364, end: 0.521, arrived: true },
  { name: 'other', stamped: 0.090, end: 0.120, arrived: false }] };
const won = choose([monday, good]);
check('the disagreeing fit is skipped and the agreeing one wins',
  won && won.k === 8 && won.signature.name === 'the register', JSON.stringify(won && won.k));

console.log('\nand when several agree, the widest gap wins:');
const narrow = { k: 9, clusters: [
  { name: 'the register', stamped: 0.40, end: 0.50, arrived: true },
  { name: 'close', stamped: 0.37, end: 0.20, arrived: false }] };
check('the fit whose lead is clearest is taken',
  choose([narrow, good]).k === 8, String(choose([narrow, good]).k));

console.log('\nand if nothing agrees:');
check('nothing is chosen, so nothing is published', choose([monday]) === null);

console.log(failed ? `\ncluster selector: ${failed} failed` : '\ncluster selector: all hold');
process.exit(failed ? 1 : 0);
