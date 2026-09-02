// Reading the sampled pull request descriptions back out of data/docs.
//
// Each day was written against its own vocabulary, so loading a window means
// building one vocabulary across the window and remapping every document into
// it. Documents come back as sparse vectors: parallel idx/val arrays, which is
// the shape the clustering wants and the shape that avoids allocating a
// hundred thousand objects.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

export function availableDays(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f))
    .map((f) => f.slice(0, 10)).sort();
}

export function readDay(dir, day) {
  return JSON.parse(gunzipSync(readFileSync(join(dir, `${day}.json.gz`))));
}

/** The per-day summary lines, without decoding any document. */
export function readSummaries(dir, days = availableDays(dir)) {
  return days.map((day) => {
    const d = readDay(dir, day);
    return { date: d.date, scanned: d.scanned, signed: d.signed,
             unsigned: d.unsigned, products: d.products, words: d.vocab.length,
             docs: d.docs.length };
  });
}

/**
 * Load a window of days as one document set over one vocabulary.
 * @param {string} dir  data/docs
 * @param {{days?: string[], minDf?: number}} opts
 *   minDf — a word must appear in this many documents across the whole window
 * @returns {{vocab: string[], docs: Array, days: string[]}}
 *   each doc is { idx, val, n, signed, day, author, repo }; idx indexes vocab.
 */
export function loadWindow(dir, { days = availableDays(dir), minDf = 25 } = {}) {
  const loaded = [];
  const df = new Map();
  for (const day of days) {
    const d = readDay(dir, day);
    const bags = [];
    for (const doc of d.docs) {
      const bag = [];
      let at = 0;
      for (let i = 3; i < doc.length; i += 2) { at += doc[i]; bag.push([d.vocab[at], doc[i + 1]]); }
      bags.push({ signed: doc[0] === 1, author: `${day}/${doc[1]}`, repo: `${day}/${doc[2]}`, bag });
      for (const [w] of bag) df.set(w, (df.get(w) || 0) + 1);
    }
    loaded.push({ day, bags });
  }

  const vocab = [...df].filter(([, n]) => n >= minDf).map(([w]) => w).sort();
  const at = new Map(vocab.map((w, i) => [w, i]));
  const docs = [];
  for (const { day, bags } of loaded) {
    for (const b of bags) {
      const idx = [], val = [];
      let n = 0;
      for (const [w, c] of b.bag) {
        const i = at.get(w);
        if (i === undefined) continue;
        idx.push(i); val.push(c); n += c;
      }
      if (idx.length < 5) continue;
      docs.push({ idx, val, n, signed: b.signed, day, author: b.author, repo: b.repo });
    }
  }
  return { vocab, docs, days };
}
