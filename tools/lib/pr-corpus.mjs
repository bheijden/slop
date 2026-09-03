// Shared reading of GitHub pull request descriptions.
//
// Everything here is deliberately dull. The one thing that must not be
// hardcoded is *which* agents exist, because that is a fact about September
// 2026 and will be wrong by spring. Everything else is a stated constant: you
// can read the number, argue with it, and change it in one place.

const TOKENS_MIN = Number(process.env.SLOP_TOKENS_MIN ?? 25);  // shorter than this is a stub, not writing
// Share of tokens that must be English function words. Over a day of
// descriptions the median is 0.23, and everything under about 0.06 is a file
// listing rather than writing. 0.12 is the figure the linter's own prose gate
// already uses to decide something is prose at all.
const ENGLISH_MIN = Number(process.env.SLOP_ENGLISH_MIN ?? 0.12);

// Agents sign in two shapes, and both are recognised by form rather than by
// product name, so one nobody has heard of yet is still caught.
//
// 1. A trailing line whose grammar is attribution.
export const FOOTER = /^\s*\W{0,4}\s*(?:co-?authored[- ]by|generated (?:with|by)|created (?:with|by)|assisted by|authored by)\b/i;
// 2. An HTML comment holding a shouted sentinel, which is a tool talking to
//    itself: <!-- CURSOR_AGENT_PR_BODY_BEGIN -->. A person writing a comment
//    writes prose in it, not SCREAMING_SNAKE_CASE.
export const SENTINEL = /<!--\s*([A-Z][A-Z0-9]*(?:_[A-Z0-9]+){1,})\s*-->/g;

// Bots by the shape of the login, the way upstream does it.
export const BOT_LOGIN = /\[bot\]$|-bot$|^dependabot|^renovate|^github-actions|^copilot$|^pull$|^truecharts-admin$/i;

// English function words. This list is hardcoded on purpose: unlike the set of
// agent products, it is not a fact that goes stale.
const EN = new Set(('the of and to a in that is was for it with as be on by at this from or an are '
  + 'but not have has had which they you we he she their our its will would can could should there '
  + 'been being do does did if then than when what who how all any some no more most other into over')
  .split(/\s+/).filter((w) => /^[a-z]+$/.test(w)));

const URL_RE = /https?:\/\/[^\s<>"'`)\]}]+/g;
const TAG_RE = /<[a-z/!][^<>]*>/gi;
const WORD_RE = /[a-z0-9_/-]*[a-z][a-z0-9_/-]*/g;

// Three letters to count as a word. Without it the list fills with 375px, a2,
// f4 and ss, which are measurements and identifiers rather than writing.
const LETTERS = /[a-z]/g;

function tokenize(body) {
  const rest = body.toLowerCase().replace(URL_RE, ' ').replace(TAG_RE, ' ');
  const out = [];
  for (const raw of rest.match(WORD_RE) || []) {
    const w = raw.replace(/^[_/]+/, '').replace(/[_/]+$/, '').replace(/-+$/, '');
    if (w && (w.match(LETTERS) || []).length >= 3) out.push(w);
  }
  return out;
}

// A tool writing about its own configuration is not a style tell, it is the
// subject: claude/settings and anthropic_api_key say nothing about how a
// sentence is built. The names come from the marker list, so the two stay in
// step and neither is a separate thing to remember.
export function toolWordFilter(markers) {
  const names = (markers.excludeWords || []).map((w) => w.toLowerCase());
  if (!names.length) return () => false;
  const re = new RegExp(`(^|[^a-z])(${names.join('|')})([^a-z]|$)`, 'i');
  return (word) => re.test(word);
}

// Split the trailing attribution block off the body. Returns the writing and
// the signature separately, so the signature can decide the label without ever
// reaching the word counts.
// The signature is everything the tool wrote about itself: the trailing
// attribution block, plus any sentinel comments wherever they sit. It is taken
// out of the writing before a single word is counted, and only it decides the
// label.
export function splitFooter(body) {
  const sentinels = body.match(SENTINEL) || [];
  body = body.replace(SENTINEL, ' ');
  const lines = body.split('\n');
  let cut = lines.length;
  for (let i = lines.length - 1; i >= 0 && i >= lines.length - 8; i--) {
    const l = lines[i].trim();
    if (!l) continue;
    if (FOOTER.test(l) || /^🤖/.test(l)) cut = i;
    else if (cut !== lines.length) break;   // a real line: the block has ended
  }
  return { text: lines.slice(0, cut).join('\n'),
           footer: [...sentinels, lines.slice(cut).join('\n')].join('\n').trim() };
}

function isEnglish(tokens) {
  if (!tokens.length) return false;
  let n = 0;
  for (const t of tokens) if (EN.has(t)) n++;
  return n / tokens.length >= ENGLISH_MIN;
}

// One record -> what the counter needs, or null if it is not usable writing.
export function prepare(rec, markerRe) {
  const author = rec.author || rec.user?.login || '';
  if (BOT_LOGIN.test(author) || rec.user?.type === 'Bot') return null;
  const body = rec.body || '';
  if (!body) return null;
  const { text, footer } = splitFooter(body);
  const tokens = tokenize(text);
  if (tokens.length < TOKENS_MIN) return null;
  if (!isEnglish(tokens)) return null;
  return { author, repo: rec.repo || rec.repository_url || '', tokens,
           marked: markerRe ? markerRe.test(footer) : false, footer };
}

export function markerRegex(markers) {
  if (!markers.length) return null;
  return new RegExp(markers.map((m) => m.pattern).join('|'), 'i');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The search API allows 30 calls a minute authenticated. Pace, retry, and say
// so rather than failing a whole run on one 403.
export async function searchPRs(window, token) {
  const q = `is:pr is:public created:${window} in:body the`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=100`,
      { headers: { accept: 'application/vnd.github+json', ...(token ? { authorization: `Bearer ${token}` } : {}) } });
    if (res.ok) return (await res.json()).items || [];
    if (res.status === 403 || res.status === 429) { await sleep(10000); continue; }
    throw new Error(`search ${res.status} ${res.statusText}`);
  }
  throw new Error('search: rate limited after four attempts');
}

// Ten five-minute windows, one from each 2.4-hour block of the day, start times
// drawn to the second. Blocks stop them clumping and make overlap impossible;
// seconds keep them off the instants when cron fires and automation opens PRs.
export function windowsForDay(dateISO, count = 10, minutes = 5) {
  let h = 0;
  for (const c of dateISO) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = () => ((h = (h * 1103515245 + 12345) >>> 0) / 4294967296);
  const day = Date.parse(dateISO + 'T00:00:00Z');
  const block = 86400000 / count;
  const out = [];
  for (let i = 0; i < count; i++) {
    const start = day + i * block + Math.floor(rnd() * (block - minutes * 60000));
    const a = new Date(start).toISOString().replace(/\.\d+Z$/, 'Z');
    const b = new Date(start + minutes * 60000).toISOString().replace(/\.\d+Z$/, 'Z');
    out.push(`${a}..${b}`);
  }
  return out;
}
