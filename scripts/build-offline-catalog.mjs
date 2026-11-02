// Builds public/catalog/products.json — the full product catalog the storefront falls back to when
// the local API is down. Source (first found):
//   1. server/data/toptex-products-all.json  (raw export from `npm run catalog:export --prefix server`)
//   2. server/data/catalog.json              (catalog saved by the API's TopTex sync)
// Usage: npm run catalog:offline            (skips when the output is already up to date)
//        npm run catalog:offline -- --force
import fs from 'node:fs';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { fileURLToPath } from 'node:url';
import { makeNormalizer } from '../server/src/lib/normalize.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPORT = path.join(root, 'server/data/toptex-products-all.json');
const SAVED = path.join(root, 'server/data/catalog.json');
const OUT = path.join(root, 'public/catalog/products.json');
const force = process.argv.includes('--force');
const rel = (f) => path.relative(root, f);

const src = [EXPORT, SAVED].find((f) => fs.existsSync(f));
if (!src) { console.log('[offline catalog] no downloaded catalog found — skipped (run: npm run catalog:export --prefix server)'); process.exit(0); }
if (!force && fs.existsSync(OUT) && fs.statSync(OUT).mtimeMs >= fs.statSync(src).mtimeMs) {
  console.log(`[offline catalog] ${rel(OUT)} is up to date`);
  process.exit(0);
}

function* readLines(file) {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(8 << 20);
  const dec = new StringDecoder('utf8');
  let rest = '', n;
  try {
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      const lines = (rest + dec.write(buf.subarray(0, n))).split('\n');
      rest = lines.pop();
      yield* lines;
    }
    rest += dec.end();
    if (rest) yield rest;
  } finally { fs.closeSync(fd); }
}

const started = Date.now();
let products = [], skipped = 0, sourceTotal = null, exportedAt = null;

if (src === EXPORT) {
  const normalize = makeNormalizer(process.env.TOPTEX_LANG || 'en');
  const seen = new Set();
  const add = (item) => {
    let p = null;
    try { p = normalize(item); } catch { /* malformed */ }
    if (!p) { skipped++; return; }
    if (!seen.has(p.slug)) { seen.add(p.slug); products.push(p); }
  };
  let lines = 0;
  for (const line of readLines(EXPORT)) {
    const s = line.trim().replace(/^,|,$/g, '');
    if (s.startsWith('{"')) { try { add(JSON.parse(s)); lines++; } catch { /* not a product line */ } continue; }
    const m = s.match(/^"(exportedAt|totalCountReported)":\s*"?([^",]*)"?/);
    if (m) m[1] === 'exportedAt' ? (exportedAt = m[2]) : (sourceTotal = Number(m[2]) || null);
  }
  if (!lines) { // not in the export layout: plain JSON array or {products|items}
    const d = JSON.parse(fs.readFileSync(EXPORT, 'utf8'));
    (Array.isArray(d) ? d : d.products || d.items || []).forEach(add);
  }
} else {
  const d = JSON.parse(fs.readFileSync(SAVED, 'utf8'));
  products = d.products || [];
  sourceTotal = d.sourceTotal; exportedAt = d.generatedAt; skipped = d.skipped || 0;
}

if (!products.length) { console.warn(`[offline catalog] ${rel(src)} has no usable products — skipped`); process.exit(0); }
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT + '.part', JSON.stringify({ generatedAt: exportedAt || new Date().toISOString(), generatedFrom: path.basename(src), sourceTotal: sourceTotal || products.length + skipped, skipped, products }));
fs.renameSync(OUT + '.part', OUT);
console.log(`[offline catalog] ${products.length} products from ${rel(src)} -> ${rel(OUT)} (${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB, ${((Date.now() - started) / 1000).toFixed(1)} s${skipped ? `, ${skipped} without price/sizes skipped` : ''})`);
