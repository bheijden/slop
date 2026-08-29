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

// Local corrections to upstream rules. Kept here so `node tools/build-rules.mjs`
// does not silently revert them the next time vendor/ is refreshed.
//
// colon-triple: upstream's item body is `[^.!?;:\n]{2,40}`, which matches any
// three comma-separated things. Over 29k words of technical writing that fired
// 21 times and only 5 were real -- the rest were docstrings, matrix algebra,
// hardware lists and Title-Case component names. Two changes fix it without
// losing recall: items may not contain code, math or path characters, and each
// item must start lowercase (prose items do; proper-noun enumerations do not).
// Measured after the change: 5 hits over the same corpus, all true positives,
// and every upstream example still passes.
const COLON_TECH = String.raw`=\[\]\(\)\{\}"'\/\\|_~^%*+<>&#@$\u2192\u21d2\u2194\u00b0`;
const COLON_ITEM = String.raw`[a-z][^.!?;:\n,${COLON_TECH}]{1,39}`;

const OVERRIDES = {
  'not-just': {
    // Upstream also matches the form where "not only" negates a clause rather
    // than a thing: "not only because performance differences impair the
    // system". A negative lookahead for subordinating conjunctions removes
    // exactly those. Measured over 18 matched document pairs: human hits fell
    // from 5 to 3 and all 3 AI hits were kept. The two dropped were the only
    // genuine errors; the three that remain are people using the construction
    // correctly, which is not this rule's business to suppress.
    pattern: String.raw`\bnot\s+(?:just|only|merely|simply)\s+(?!because|when|if|since|though|although|that\b|as\b|to\b|in\s+order)[^.!?\n;]{1,50}?,?\s+but(?:\s+also)?\b|\b(?:it|this|that)(?:['\u2019]s|\s+(?:is|was))\s+not\s+[^.!?\n,;\u2014\u2013]{1,60}[,;\u2014\u2013]\s*(?:it|this|that)(?:['\u2019]s|\s+(?:is|was))\b`,
    note: 'Tightened from upstream, which also matched "not only" negating a clause rather than a thing. Over 18 matched document pairs this cut hits on human prose from 5 to 3 while keeping all 3 on AI prose. See research/audit.md.',
    tests: {
      hit: ['This is not just a tool, but a philosophy.',
            'It was not merely mistaken, but dangerous.',
            'Not only fast but also reliable.',
            'It\u2019s not a bug \u2014 it\u2019s a feature.'],
      miss: ['He did not buy it.',
             'She was not sure about the plan.',
             'not only because performance differences impair the system, but the effect is small'],
    },
  },
  'colon-triple': {
    pattern: String.raw`:\s+${COLON_ITEM},\s+${COLON_ITEM},\s+(?:and\s+|or\s+)?${COLON_ITEM}(?=[.!?\n])`,
    description: 'A colon opening onto three or more comma-separated prose items: \u201cseparate ports, processes, and local state\u201d. The most common shape LLM prose uses to sound concrete. Tightened from upstream: items must read as prose, not as code, measurements or proper-noun lists.',
    tests: {
      hit: [
        'The fix needs three things: separate ports, separate processes, and separate state.',
        'Each service gets its own everything: ports, processes, local state.',
        'It splits into three: the core, the accumulated solver craft, and the agent harness around it.',
        'What it buys: continuous calibration against live data, regression gates on every model edit, and drift alarms that fire early.'
      ],
      miss: [
        'The recipe calls for flour, butter, and sugar.',
        'Note: the flag is off by default.',
        'svd_mode: SVD mode ("truncate", "damp", or None).',
        'Returns: theta_opt, cost_history, primary_rms_history.',
        'Chipset: Intel CNVi, hci0, BlueZ 5.',
        'Exit codes: clean, findings over budget, usage/read error.',
        'Reroot k: B=per[k], per[0]=I, per[j]=B-1per[j].',
        'Checks: oracle, gauge-invariance, FK/residual/J parity.',
        'Units: vessels, exchangers, columns, reactors.',
        'Four layers: Frontend Experience, API & Gateway, Cognitive Orchestration, Physical Execution.',
        'The stack: UI, visualization, local SDK in one place.',
        'Pipeline: Perception, Planning, Actuation, Orchestration.',
        'Laptop: Alienware m15 R4, Intel Wi-Fi 6 AX200, Ubuntu 20.',
        'iw shows HE-MCS 11 at 1 Gbps, signal -30 to -40 dBm, 0% packet loss.'
      ]
    }
  }
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

// Divergences from the vendored upstream, kept in one place so every one is
// visible and survives re-vendoring. Both tables are applied after import.
//
// NOTES records behaviour we have measured and decided to live with. The rule
// is upstream's and stays upstream's; the note says what it does on real prose.
const NOTES = {
  'echo-triad':
    'Known to fire on human prose. In an audit over 18 pre-2022 human documents it '
    + 'hit 10 of them and only 1 of 18 AI documents, because the shared run is usually '
    + 'the document\'s topic rather than a repeated frame: "the person who died" in '
    + 'guidance, "in the python 2" in a PEP. Kept unchanged because it is upstream\'s '
    + 'rule and the shape it describes is real. Tighter formulations are measured in '
    + 'candidates/variants.json and the numbers are in research/audit.md.',
  'stacked-questions':
    'Fires on essayists setting up a topic, which is a rhetorical move much older than '
    + 'the technology it is meant to detect: "Who are the speakers of AAE? How are they '
    + 'viewed?". Hit 3 of 18 human documents and 0 of 18 AI ones in the audit. Kept '
    + 'unchanged; stacked-questions-run3 in candidates/variants.json requires three in '
    + 'a row and removed every false positive.',
};

const sets = { 'simonwillison': [], 'wikipedia-ai': [] };
for (const p of api.patterns) {
  const setName = p.group ? 'wikipedia-ai' : 'simonwillison';
  const f = p.find;
  const rule = {
    id: p.id,
    name: p.name,
    severity: 'warn',
    description: p.description,
    suggest: SUGGEST[p.id] || 'Rewrite plainly.'
  };
  if (NOTES[p.id]) rule.note = NOTES[p.id];
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
  if (OVERRIDES[p.id]) Object.assign(rule, OVERRIDES[p.id]);
  sets[setName].push(rule);
}

// Rule sets carry their own version, plus the engine version they were built
// against, so an installed copy can be compared with a newer one from the same
// source and with the engine trying to run it.
const ENGINE = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

const META = {
  'simonwillison': {
    name: 'simonwillison',
    version: '1.0.0',
    slop: ENGINE,
    title: 'Simon Willison',
    description: 'Stock phrasings and rhythms that language models overproduce, collected by Simon Willison for the LLM cliche highlighter.',
    source: 'https://tools.simonwillison.net/llm-cliche-highlighter'
  },
  'wikipedia-ai': {
    name: 'wikipedia-ai',
    version: '1.0.0',
    slop: ENGINE,
    title: 'Signs of AI writing (Wikipedia)',
    description: 'Tells catalogued by Wikipedia editors reviewing AI-generated article text.',
    source: 'https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing'
  }
};

// Rules off by default. Measured, not guessed - see docs/calibration.md.
// colon-triple used to be here; it was fixed instead (see OVERRIDES above).
const OFF_BY_DEFAULT = new Set([]);

// The skill's rule catalogue is generated, so it cannot drift from the rules.
{
  const lines = ['# Rule catalogue', '',
    'Generated by `node tools/build-rules.mjs`. Every rule id below works with',
    '`--select` and `--ignore`, and `explain <id>` prints its examples.', ''];
  for (const [key, rules] of Object.entries(sets)) {
    lines.push(`## ${META[key].title}: \`${key}\``, '', META[key].description, '',
      '| rule | flags | fix |', '|---|---|---|');
    for (const r of rules) {
      const clean = (t) => String(t).replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
      lines.push(`| \`${r.id}\` | ${clean(r.description).slice(0, 150)} | ${clean(r.suggest)} |`);
    }
    lines.push('');
  }
  fs.writeFileSync(path.join(ROOT, 'skill/reference/rules.md'), lines.join('\n'));
  console.log('skill/reference/rules.md  ' + lines.length + ' lines');
}

// The web page cannot list a directory, so ship a manifest alongside the sets.
// List what is actually there, not what this script generates: a hand-written
// set alongside the generated ones used to be dropped from the manifest on
// every rebuild, so the page silently stopped applying it while the CLI, which
// reads the directory, carried on applying it.
fs.writeFileSync(path.join(ROOT, 'rules', 'index.json'),
  JSON.stringify({ sets: fs.readdirSync(path.join(ROOT, 'rules'))
    .filter((f) => f.endsWith('.json') && f !== 'index.json').sort() }, null, 2) + '\n');

for (const [key, rules] of Object.entries(sets)) {
  for (const r of rules) if (OFF_BY_DEFAULT.has(r.id)) r.default = 'off';
  const out = { ...META[key], rules };
  fs.writeFileSync(path.join(ROOT, 'rules', key + '.json'), JSON.stringify(out, null, 2) + '\n');
  const kinds = {};
  for (const r of rules) kinds[r.kind] = (kinds[r.kind] || 0) + 1;
  const tests = rules.reduce((a, r) => a + r.tests.hit.length + r.tests.miss.length, 0);
  console.log(`${key.padEnd(14)} ${String(rules.length).padStart(2)} rules  ${JSON.stringify(kinds)}  ${tests} test cases`);
}
