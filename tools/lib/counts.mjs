// Reading the daily count files back.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

export function readDay(dir, day) {
  const gz = join(dir, `${day}.json.gz`);
  if (existsSync(gz)) return JSON.parse(gunzipSync(readFileSync(gz)).toString('utf8'));
  const plain = join(dir, `${day}.json`);
  if (existsSync(plain)) return JSON.parse(readFileSync(plain, 'utf8'));
  return null;
}

export function listDays(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((f) => f.replace(/\.json(\.gz)?$/, ''))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
}

// Sum a set of days into one table. `from`/`to` are inclusive ISO dates.
export function accumulate(dir, { from, to } = {}) {
  const words = new Map();
  const totals = { marked: 0, unmarked: 0, days: 0 };
  for (const day of listDays(dir)) {
    if (from && day < from) continue;
    if (to && day > to) continue;
    const d = readDay(dir, day);
    if (!d) continue;
    totals.days++;
    totals.marked += d.marked.docs;
    totals.unmarked += d.unmarked.docs;
    for (const [w, [md, ud, ma, ua]] of Object.entries(d.words)) {
      const e = words.get(w) || [0, 0, 0, 0];
      // Author counts are per day, so summing them counts a person who appears
      // on two days twice. That is a floor on distinct people, not the exact
      // number, and it is used only as a floor.
      words.set(w, [e[0] + md, e[1] + ud, e[2] + ma, e[3] + ua]);
    }
  }
  return { words, totals };
}
