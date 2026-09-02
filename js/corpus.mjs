// The back-testing corpus in data/corpus: matched human/machine pairs on one
// topic each. See data/corpus/README.md for what it is and what it is not.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CORPUS_DIR = path.join(ROOT, 'data', 'corpus');

/**
 * @param {{dir?: string}} opts
 * @returns {{pairs: Array, human: Array, ai: Array}} documents carry
 *   { id, register, side, words, text } alongside the index entry.
 */
export function loadCorpus({ dir = CORPUS_DIR } = {}) {
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'pairs.json'), 'utf8'));
  const pairs = index.pairs;
  const read = (p, side) => {
    const text = fs.readFileSync(path.join(dir, p[side].file), 'utf8');
    return { ...p[side], id: p.id, register: p.register, side, text };
  };
  return {
    pairs,
    human: pairs.map((p) => read(p, 'human')),
    ai: pairs.map((p) => read(p, 'ai')),
  };
}
