// In-memory product catalog served to the storefront with server-side paging.
// Source: server/data/catalog.json (written by `npm run catalog:sync` from the TopTex API);
// If TopTex is offline or that copy is missing/incomplete, products come from the full raw export
// (server/data/toptex-products-all.json, written by `npm run catalog:export`); the bundled sample
// catalog (src/data/catalog.json) is the last resort.
import fs from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { makeNormalizer, parseWeightKg } from '../lib/normalize.js';

const SYNCED = fileURLToPath(new URL('../../data/catalog.json', import.meta.url));
const BUNDLED = fileURLToPath(new URL('../../../src/data/catalog.json', import.meta.url));
export const EXPORT_FILE = fileURLToPath(new URL('../../data/toptex-products-all.json', import.meta.url));

const SIZE_ORDER = ['One Size', 'XXS', 'XS', 'S', 'S/M', 'M', 'M/L', 'L', 'L/XL', 'XL', 'XXL', 'XXXL', '3XL', '4XL', '5XL'];
const sizeRank = (s) => { const i = SIZE_ORDER.indexOf(s); return i === -1 ? 999 : i; };
const COLOR_FAMILIES = ['White', 'Black', 'Blue', 'Red', 'Green', 'Orange', 'Brown', 'Beige', 'Grey', 'Yellow', 'Violet', 'Pink', 'Pattern'];
const uniq = (a) => [...new Set(a)];

let state = null;

function index(products, meta) {
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const bySku = new Map();
  for (const p of products) {
    for (const c of p.colors) for (const s of c.sizes) bySku.set(s.sku, { product: p, color: c, size: s });
  }
  const catCount = products.reduce((m, p) => m.set(p.category, (m.get(p.category) || 0) + 1), new Map());
  const facets = {
    categories: [...catCount.keys()].sort((a, b) => catCount.get(b) - catCount.get(a)),
    sizes: uniq(products.flatMap((p) => p.colors.flatMap((c) => c.sizes.map((s) => s.size)))).sort((a, b) => sizeRank(a) - sizeRank(b)),
    colors: COLOR_FAMILIES.filter((f) => products.some((p) => p.colors.some((c) => c.family.includes(f)))),
    genders: ['Men', 'Women', 'Unisex', 'Kids'],
    types: uniq(products.map((p) => p.type)).sort(),
    ecoCount: products.filter((p) => p.eco.length).length,
    priceMin: products.length ? Math.floor(Math.min(...products.map((p) => p.priceFrom))) : 0,
    priceMax: products.length ? Math.ceil(Math.max(...products.map((p) => p.priceFrom))) : 0,
    total: products.length,
  };
  // Precomputed search haystack keeps filtering fast on large catalogs.
  const hay = new Map(products.map((p) => [p, `${p.name} ${p.brand} ${p.id} ${p.category} ${p.type} ${p.description}`.toLowerCase()]));
  state = { products, bySlug, bySku, facets, hay, meta };
}

// ------------------------------------------------------------------ offline fallback (raw export)
/** Reads a file line by line without loading it whole (the raw export can be hundreds of MB). */
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

/** Raw TopTex products from the export file (one product per line), or any JSON array / {products} file. */
function readExport(file) {
  const raw = [];
  let exportedAt = null, reported = null;
  for (const line of readLines(file)) {
    const s = line.trim().replace(/^,|,$/g, '');
    if (s.startsWith('{"')) { try { raw.push(JSON.parse(s)); } catch { /* not a product line */ } continue; }
    const m = s.match(/^"(exportedAt|totalCountReported)":\s*"?([^",]*)"?/);
    if (m) m[1] === 'exportedAt' ? (exportedAt = m[2]) : (reported = Number(m[2]) || null);
  }
  if (!raw.length && fs.statSync(file).size < 400 * 1048576) { // not in export layout: try plain JSON
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    raw.push(...(Array.isArray(d) ? d : d.products || d.items || []));
    exportedAt ||= d.exportedAt || null;
  }
  return { raw, exportedAt, reported };
}

/** Normalises the raw export and saves it as the shop catalog. Returns the saved data, or null. */
function importExport(log) {
  const started = Date.now();
  const { raw, exportedAt, reported } = readExport(EXPORT_FILE);
  const normalize = makeNormalizer(config.toptex.lang);
  const products = [], seen = new Set();
  let skipped = 0;
  for (const item of raw) {
    let p = null;
    try { p = normalize(item); } catch { /* malformed item */ }
    if (!p) { skipped++; continue; }
    if (!seen.has(p.slug)) { seen.add(p.slug); products.push(p); }
  }
  if (!products.length) { log(`${EXPORT_FILE} has no usable products — ignored`); return null; }
  const data = { generatedAt: exportedAt || fs.statSync(EXPORT_FILE).mtime.toISOString(), sourceTotal: reported || raw.length, generatedFrom: 'toptex-export', skipped, products };
  fs.mkdirSync(new URL('../../data/', import.meta.url), { recursive: true });
  fs.writeFileSync(SYNCED, JSON.stringify(data));
  // Date the shop copy like the export, so the next online sync still sees it as due for a refresh.
  const t = fs.statSync(EXPORT_FILE).mtime;
  fs.utimesSync(SYNCED, t, t);
  log(`loaded ${products.length} products from the downloaded TopTex export (${Math.round((Date.now() - started) / 1000)} s${skipped ? `, ${skipped} without price/sizes skipped` : ''})`);
  return data;
}

const incomplete = (d) => d.sourceTotal && d.products.length + (d.skipped || 0) < d.sourceTotal * 0.95;

/**
 * Loads the best catalog available on disk:
 * 1. server/data/catalog.json, unless it is missing, incomplete or older than the raw export;
 * 2. otherwise the raw export (converted and saved as catalog.json);
 * 3. otherwise the sample catalog bundled with the web app.
 */
export function loadCatalog({ log = (m) => console.log(`[catalog] ${m}`) } = {}) {
  let data = null, file = null;
  if (fs.existsSync(SYNCED)) {
    try { data = JSON.parse(fs.readFileSync(SYNCED, 'utf8')); file = SYNCED; } catch (e) { log(`saved catalog unreadable (${e.message})`); }
  }
  if (fs.existsSync(EXPORT_FILE)) {
    const exportNewer = data && fs.statSync(EXPORT_FILE).mtimeMs > fs.statSync(SYNCED).mtimeMs + 2000;
    if (!data || incomplete(data) || exportNewer) {
      try {
        const imported = importExport(log);
        if (imported) { data = imported; file = SYNCED; }
      } catch (e) { log(`could not read ${EXPORT_FILE}: ${e.message}`); }
    }
  }
  if (!data) { data = JSON.parse(fs.readFileSync(BUNDLED, 'utf8')); file = BUNDLED; }
  const source = file === BUNDLED ? 'bundled' : data.generatedFrom === 'toptex-export' ? 'toptex-export' : 'toptex-sync';
  index(data.products, { source, generatedAt: data.generatedAt || null, sourceTotal: data.sourceTotal, skipped: data.skipped || 0 });
  return state.meta;
}

/** Swaps the in-memory catalog without writing it to disk (used while a sync is still running). */
export function setCatalog(products, meta = {}) {
  index(products, { source: 'toptex-sync', generatedAt: new Date().toISOString(), ...meta });
  return state.meta;
}

/** Age of the saved TopTex catalog in hours, or null when there is none. */
export function syncedCatalogAgeHours() {
  if (!fs.existsSync(SYNCED)) return null;
  return (Date.now() - fs.statSync(SYNCED).mtimeMs) / 3_600_000;
}

export function saveCatalog(products, meta = {}) {
  fs.mkdirSync(new URL('../../data/', import.meta.url), { recursive: true });
  fs.writeFileSync(SYNCED, JSON.stringify({ generatedAt: new Date().toISOString(), sourceTotal: products.length, ...meta, products }));
  return loadCatalog();
}

const cat = () => state || (loadCatalog(), state);
export const catalogMeta = () => ({ ...cat().meta, products: cat().products.length });
export const facets = () => cat().facets;
export const getProduct = (slug) => cat().bySlug.get(slug) || null;
export const getSku = (sku) => cat().bySku.get(sku) || null;

/** Unit weight in kg for shipping quotes. */
export const skuWeightKg = (sku, fallback) => parseWeightKg(getSku(sku)?.product.weight) ?? fallback;

// Light shape for listing cards: one packshot per colour, no size tables.
const card = (p) => ({
  id: p.id, slug: p.slug, brand: p.brand, name: p.name, description: p.description, category: p.category,
  active: p.active, priceFrom: p.priceFrom, eco: p.eco,
  colors: p.colors.map((c) => ({ name: c.name, hex: c.hex, shots: c.shots.slice(0, 1) })),
  images: p.images.slice(0, 1),
});

const arr = (v) => (Array.isArray(v) ? v : v ? String(v).split(',').filter(Boolean) : []);

export function search(params) {
  const { products, hay } = cat();
  const category = params.cat || '';
  const needle = String(params.q || '').trim().toLowerCase();
  const sizes = arr(params.sizes), colors = arr(params.colors), genders = arr(params.genders), types = arr(params.types);
  const eco = params.eco === '1' || params.eco === 'true';
  const maxPrice = params.maxPrice ? Number(params.maxPrice) : null;
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const pageSize = Math.min(60, Math.max(1, parseInt(params.pageSize, 10) || 12));

  const results = products.filter((p) => {
    if (category && p.category !== category) return false;
    if (needle && !hay.get(p).includes(needle)) return false;
    if (sizes.length && !p.colors.some((c) => c.sizes.some((s) => sizes.includes(s.size)))) return false;
    if (colors.length && !p.colors.some((c) => c.family.some((f) => colors.includes(f)))) return false;
    if (genders.length && !p.gender.some((g) => genders.includes(g))) return false;
    if (eco && !p.eco.length) return false;
    if (maxPrice != null && Number.isFinite(maxPrice) && p.priceFrom > maxPrice) return false;
    if (types.length && !types.includes(p.type)) return false;
    return true;
  });
  const start = (page - 1) * pageSize;
  return { items: results.slice(start, start + pageSize).map(card), page, pageSize, total: results.length, hasMore: start + pageSize < results.length };
}

export function related(p, n = 4) {
  const { products } = cat();
  const same = products.filter((x) => x.id !== p.id && x.category === p.category);
  const rest = products.filter((x) => x.id !== p.id && x.category !== p.category);
  return [...same, ...rest].slice(0, n).map(card);
}
