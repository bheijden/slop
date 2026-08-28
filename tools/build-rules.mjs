// Regenerate rules/*.json from the vendored upstream tool.
//   node tools/build-rules.mjs
// The regexes are lifted verbatim; only metadata (set, severity, why, suggest)
// and the test cases are added here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const src = fs.readFileSync(path.join(ROOT, 'vendor/llm-cliche-highlighter.html'), 'utf8');
const cut = (n) => src.split(`// ==== ${n} start ====`)[1].split(`// ==== ${n} end ====`)[0];

let impl = cut('impl');
const n0 = impl.length;
impl = impl
  .replace(`function makeRegexFinder(re) {\n  return function (text) {`,
           `function makeRegexFinder(re) {\n  const __f = function (text) {`)
  .replace(`      found.push({ start: m.index, end: m.index + m[0].length });\n    }\n    return found;\n  };\n}`,
           `      found.push({ start: m.index, end: m.index + m[0].length });\n    }\n    return found;\n  };\n  __f.kind='regex'; __f.re=re; return __f;\n}`)
  .replace(`  const chain = new RegExp(String.raw\`\\b\${item}(?:\${CHAIN_SEP}\${item})+\`, 'gi');\n  return function (text) {`,
           `  const chain = new RegExp(String.raw\`\\b\${item}(?:\${CHAIN_SEP}\${item})+\`, 'gi');\n  const __f = function (text) {`)
  .replace(`        badgeTitle: count + ' ' + itemLabel + (count === 1 ? '' : 's')\n      });\n    }\n    return found;\n  };\n}`,
           `        badgeTitle: count + ' ' + itemLabel + (count === 1 ? '' : 's')\n      });\n    }\n    return found;\n  };\n  __f.kind='chain'; __f.re=chain; __f.head=head; __f.headTest=headTest; __f.itemLabel=itemLabel; return __f;\n}`);
if (impl.length === n0) throw new Error('instrumentation failed - upstream source changed');

const api = new Function(impl + cut('tests') + '\nreturn { patterns, patternCases, CHAIN_SEP };')();

// Params for the three algorithmic detectors, read from the upstream call sites.
const ALGO = {
  'echo-triad':        { kind: 'echo',          params: { minGram: 4, minRun: 2 } },
  'stacked-questions': { kind: 'question-chain',params: { minRun: 2 } },
  'sentence-anaphora': { kind: 'anaphora',      params: { minRun: 3 } }
};

const SUGGEST = {
  'no-chain': 'Say what it does have. A denial chain lists absences instead of substance.',
  'whole': 'Name the thing directly instead of gesturing at its totality.',
  'did-not-chain': 'Collapse the negations into one concrete statement of what happened.',
  'dont-verb-it': 'Drop the setup and keep the reframing, or cut both.',
  'sit-with': 'Say what the reader should conclude, not that they should dwell.',
  'already-know': 'Either state the answer or ask a real question. Do not flatter.',
  'is-the-entire': 'Replace the totalising claim with the specific mechanism.',
  'the-entire-is': 'Replace the totalising claim with the specific mechanism.',
  'is-real': 'Cut "is real". Give the evidence that makes it real.',
  'punchline': 'Deliver the point without announcing that a point is coming.',
  'worth-naming': 'Name it, or cut it. Announcing that something deserves naming is not naming it.',
  'not-nothing': 'Quantify it. "Not nothing" concedes and asserts at once, saying neither.',
  'is-the-whole': 'Name the thing directly instead of gesturing at its totality.',
  'echo-triad': 'Merge the parallel sentences into one, or vary the structure.',
  'performative-honesty': 'Delete the preamble. Honest writing does not announce itself.',
  'thats-the-part': 'State the detail instead of pointing at it.',
  'the-only-i-trust': 'Drop the superlative framing and give the actual reason.',
  'take-my-word': 'Just link the evidence.',
  'turns-out': 'State the finding without the casual-reveal framing.',
  'fits-in-your-head': 'Give the concrete measure - lines of code, number of concepts, setup steps.',
  'stacked-questions': 'Keep one question, or convert them to statements.',
  'sentence-anaphora': 'Vary the sentence openings or combine into one sentence.',
  'colon-triple': 'Fine in a real list. Suspect when it is prose padding out to three items.',
  'heres-the-twist': 'Cut the stage direction and give the content.',
  'x-is-dead': 'Say what changed and for whom, instead of the obituary headline.',
  'thats-why-mattered': 'State the consequence directly rather than asserting significance.',
  'stranded-auxiliary': 'Complete the clause. The bare auxiliary is a rhythm trick, not information.',
  'ai-vocab': 'Swap for a plainer word. One hit is coincidence; several is a tell.',
  'not-just': 'Pick the accurate half. Negative parallelism inflates without adding.',
  'note-that': 'Delete the hedge and state the fact.',
  'testament': 'Say what happened instead of what it supposedly proves.',
  'crucial-role': 'Say what it actually does.',
  'landscape': 'Cut the scene-setting and start with the subject.',
  'vague-experts': 'Name the source, or drop the claim.',
  'despite-challenges': 'Replace the formula with the specific challenge and outcome.',
  'participle-tail': 'End the sentence. The participle tail adds commentary, not information.',
  'promo': 'Drop the brochure register and describe plainly.',
  'ai-leftovers': 'Remove the artifact. This is chatbot output pasted verbatim.'
};

const casesFor = (id) => {
  const hit = [];
  const miss = [];
  for (const [cid, sample, expect] of api.patternCases) {
    if (cid !== id) continue;
    (expect > 0 ? hit : miss).push(sample);
  }
  return { hit, miss };
};

const sets = { 'llm-cliches': [], 'wikipedia-ai': [] };
for (const p of api.patterns) {
  const setName = p.group ? 'wikipedia-ai' : 'llm-cliches';
  const f = p.find;
  const rule = {
    id: p.id,
    name: p.name,
    severity: 'warn',
    description: p.description,
    suggest: SUGGEST[p.id] || 'Rewrite plainly.'
  };
  if (f.kind === 'regex') {
    rule.kind = 'regex';
    rule.pattern = f.re.source;
    rule.flags = f.re.flags;
  } else if (f.kind === 'chain') {
    rule.kind = 'chain';
    rule.pattern = f.re.source;
    rule.flags = f.re.flags;
    rule.headTest = f.headTest.source;
    rule.itemLabel = f.itemLabel;
  } else {
    Object.assign(rule, ALGO[p.id]);
  }
  rule.tests = casesFor(p.id);
  sets[setName].push(rule);
}

const META = {
  'llm-cliches': {
    name: 'llm-cliches',
    title: 'LLM cliches',
    description: 'Stock phrasings and rhythms that language models overproduce. Collected by Simon Willison for the LLM cliche highlighter.',
    source: 'https://tools.simonwillison.net/llm-cliche-highlighter'
  },
  'wikipedia-ai': {
    name: 'wikipedia-ai',
    title: 'Signs of AI writing (Wikipedia)',
    description: 'Tells catalogued by Wikipedia editors reviewing AI-generated article text.',
    source: 'https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing'
  }
};

// Rules that fire constantly on ordinary technical prose. Measured, not guessed
// - see docs/calibration.md.
const OFF_BY_DEFAULT = new Set(['colon-triple']);

// The web page cannot list a directory, so ship a manifest alongside the sets.
fs.writeFileSync(path.join(ROOT, 'rules', 'index.json'),
  JSON.stringify({ sets: Object.keys(sets).map((k) => k + '.json') }, null, 2) + '\n');

for (const [key, rules] of Object.entries(sets)) {
  for (const r of rules) if (OFF_BY_DEFAULT.has(r.id)) r.default = 'off';
  const out = { ...META[key], rules };
  fs.writeFileSync(path.join(ROOT, 'rules', key + '.json'), JSON.stringify(out, null, 2) + '\n');
  const kinds = {};
  for (const r of rules) kinds[r.kind] = (kinds[r.kind] || 0) + 1;
  const tests = rules.reduce((a, r) => a + r.tests.hit.length + r.tests.miss.length, 0);
  console.log(`${key.padEnd(14)} ${String(rules.length).padStart(2)} rules  ${JSON.stringify(kinds)}  ${tests} test cases`);
}
