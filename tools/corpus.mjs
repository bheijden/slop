#!/usr/bin/env node
// Inspect the back-testing corpus: summary table, or verify the files against
// the hashes in pairs.json.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadCorpus, CORPUS_DIR } from '../js/corpus.mjs';

const argv = process.argv.slice(2);
const check = argv.includes('--check');
const { pairs } = loadCorpus();

if (check) {
  let bad = 0;
  for (const p of pairs) {
    for (const side of ['human', 'ai']) {
      const file = path.join(CORPUS_DIR, p[side].file);
      const got = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16);
      if (got !== p[side].sha256) {
        console.error(`${p[side].file}: hash ${got}, index says ${p[side].sha256}`);
        bad++;
      }
    }
  }
  console.log(bad ? `${bad} file(s) do not match the index` : `${pairs.length * 2} files match the index`);
  process.exit(bad ? 1 : 0);
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('id', 14)}${pad('register', 12)}${pad('human date', 12)}  human    ai  source`);
for (const p of pairs) {
  console.log(
    pad(p.id, 14) + pad(p.register, 12) + pad(p.human.date, 12) +
    String(p.human.words).padStart(6) + String(p.ai.words).padStart(6) +
    '  ' + p.human.source.slice(0, 58),
  );
}
const words = (xs) => xs.reduce((a, b) => a + b, 0);
console.log(
  `\n${pairs.length} pairs, ${new Set(pairs.map((p) => p.register)).size} registers, ` +
  `${words(pairs.map((p) => p.human.words))} human words and ` +
  `${words(pairs.map((p) => p.ai.words))} machine words`,
);
