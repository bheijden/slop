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
