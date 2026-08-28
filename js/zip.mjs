// A minimal ZIP reader, so the page can take a zipped directory without a
// dependency. Handles stored (method 0) and deflated (method 8) entries, which
// covers what `zip`, macOS "Compress" and GitHub's source archives produce.
//
// Inflation uses DecompressionStream('deflate-raw'), available in browsers and
// in Node 18+, so this module runs in both and is testable outside a browser.

const EOCD = 0x06054b50;
const EOCD64_LOCATOR = 0x07064b50;
const CENTRAL = 0x02014b50;

function findEocd(view) {
  // The EOCD sits at the end, after a comment of up to 64 KB.
  const min = 22;
  const start = Math.max(0, view.byteLength - 0xffff - min);
  for (let i = view.byteLength - min; i >= start; i--) {
    if (view.getUint32(i, true) === EOCD) return i;
  }
  return -1;
}

/**
 * @param {ArrayBuffer} buf
 * @returns {Promise<{name: string, size: number, text: () => Promise<string>}[]>}
 */
export async function readZip(buf) {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const eocd = findEocd(view);
  if (eocd === -1) throw new Error('not a zip file (no end-of-central-directory record)');

  let count = view.getUint16(eocd + 10, true);
  let dirOffset = view.getUint32(eocd + 16, true);

  // Zip64: the 32-bit fields saturate and the real values live in a separate
  // record pointed at by the locator just before the EOCD.
  if (dirOffset === 0xffffffff || count === 0xffff) {
    const loc = eocd - 20;
    if (loc >= 0 && view.getUint32(loc, true) === EOCD64_LOCATOR) {
      const z64 = Number(view.getBigUint64(loc + 8, true));
      count = Number(view.getBigUint64(z64 + 32, true));
      dirOffset = Number(view.getBigUint64(z64 + 48, true));
    }
  }

  const entries = [];
  let p = dirOffset;
  for (let i = 0; i < count && p + 46 <= view.byteLength; i++) {
    if (view.getUint32(p, true) !== CENTRAL) break;
    const method = view.getUint16(p + 10, true);
    const compressed = view.getUint32(p + 20, true);
    const uncompressed = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;                    // directory entry
    if (name.split('/').some((s) => s === '__MACOSX')) continue;
    if (name.split('/').pop().startsWith('.')) continue; // dotfiles, ._resource forks

    entries.push({
      name,
      size: uncompressed,
      async text() {
        // The central directory's name/extra lengths can differ from the local
        // header's, so read the local header to find where the data starts.
        const lnameLen = view.getUint16(localOffset + 26, true);
        const lextraLen = view.getUint16(localOffset + 28, true);
        const start = localOffset + 30 + lnameLen + lextraLen;
        const raw = bytes.subarray(start, start + compressed);
        if (method === 0) return new TextDecoder().decode(raw);
        if (method !== 8) throw new Error(`${name}: unsupported compression method ${method}`);
        const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Response(stream).text();
      }
    });
  }
  return entries;
}
