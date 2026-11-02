// Downloads the full TopTex catalog through the API (GET /v3/products/all, paged) and serves it
// to the storefront from memory. Runs automatically when the API starts (if the saved copy is
// missing or older than CATALOG_REFRESH_HOURS), then on that interval, and from Admin → Catalog.
import { config, toptexConfigured } from '../config.js';
import { HttpError } from '../lib/http.js';
import { toptex } from './TopTexService.js';
import { makeNormalizer } from '../lib/normalize.js';
import { catalogMeta, loadCatalog, saveCatalog, setCatalog, syncedCatalogAgeHours } from './catalog.service.js';

const status = { running: false, page: 0, fetched: 0, total: null, startedAt: null, finishedAt: null, lastError: null };
export const syncStatus = () => ({ ...status, configured: toptexConfigured(), catalog: catalogMeta() });

let running = null;

export function syncCatalog({ log = () => {} } = {}) {
  if (!toptexConfigured()) return Promise.reject(new HttpError(400, 'Set TOPTEX_API_KEY, TOPTEX_USERNAME and TOPTEX_PASSWORD in server/.env first'));
  if (running) return running;
  // Only stream partial results into the shop when it would otherwise show just the small sample catalog.
  const firstLoad = catalogMeta().source === 'bundled';
  Object.assign(status, { running: true, page: 0, fetched: 0, total: null, startedAt: new Date().toISOString(), lastError: null });

  running = (async () => {
    const normalize = makeNormalizer(config.toptex.lang);
    const products = [];
    const seen = new Set();
    let skipped = 0;
    await toptex.getAllProducts({
      log,
      onPage: (items, page, total) => {
        const before = products.length;
        for (const raw of items) {
          let p = null;
          try { p = normalize(raw); } catch { /* malformed item */ }
          if (!p) { skipped++; continue; }
          if (!seen.has(p.slug)) { seen.add(p.slug); products.push(p); }
        }
        Object.assign(status, { page, fetched: status.fetched + items.length, total: total ?? status.total });
        log(`page ${page}: ${items.length} received (${items[0]?.catalogReference || '—'} … ${items.at(-1)?.catalogReference || '—'}), ${products.length - before} added · ${status.fetched}${status.total ? ` / ${status.total}` : ''} so far${skipped ? ` · ${skipped} skipped (no price/sizes)` : ''}`);
        // First load: show products in the shop as pages arrive (every 5 pages, to keep re-indexing cheap).
        if (firstLoad && (page === 1 || page % 5 === 0)) setCatalog([...products], { sourceTotal: status.total, partial: true });
      },
    });
    if (!products.length) throw new Error('TopTex returned no products');
    return saveCatalog(products, { sourceTotal: status.total ?? status.fetched, generatedFrom: 'toptex-api', skipped });
  })();

  return running
    .then(() => { const m = catalogMeta(); log(`done: ${m.products} products saved`); return m; })
    .catch((e) => {
      status.lastError = e.message;
      log(`download incomplete — ${e.message}. The saved catalog was NOT replaced.`);
      // TopTex offline or failing: keep the shop on the best catalog on disk (saved copy or downloaded export).
      try { const m = loadCatalog({ log }); log(`shop is using ${m.source === 'toptex-export' ? 'the downloaded TopTex export' : m.source === 'toptex-sync' ? 'the last saved TopTex catalog' : 'the bundled sample catalog'} (${catalogMeta().products} products)`); } catch (le) { log(`could not reload the saved catalog: ${le.message}`); }
      throw e;
    })
    .finally(() => { status.running = false; status.finishedAt = new Date().toISOString(); running = null; });
}

/** Called once at startup. */
export function scheduleCatalogSync() {
  const log = (m) => console.log(`[catalog] ${m}`);
  if (!toptexConfigured()) {
    const m = catalogMeta();
    log(m.source === 'bundled'
      ? 'TopTex credentials not set — showing the bundled sample catalog. Add TOPTEX_API_KEY / USERNAME / PASSWORD to server/.env for the full catalog.'
      : `TopTex credentials not set — showing ${m.products} products saved on disk (${m.source}).`);
    return;
  }
  if (config.toptex.apiKey.startsWith('eyJ') && config.toptex.apiKey.split('.').length === 3) {
    log('TOPTEX_API_KEY contains a login token, not the API key — use the {{api_key}} value from Postman. Run: npm run toptex:test');
    return;
  }
  const hours = config.catalogRefreshHours;
  let age = syncedCatalogAgeHours();
  // A saved catalog that is clearly incomplete (e.g. written by an older version that stopped early) is refreshed now.
  const m = catalogMeta();
  if (age !== null && m.sourceTotal && m.products + (m.skipped || 0) < m.sourceTotal * 0.95) {
    log(`saved catalog is incomplete (${m.products} of ${m.sourceTotal} products) — downloading again`);
    age = Infinity;
  }
  const run = () => syncCatalog({ log }).catch((e) => log(`sync failed: ${e.message}${e.status ? ` (HTTP ${e.status})` : ''}`));
  if (age === null || age >= hours) {
    if (age !== Infinity) log(age === null ? 'no saved TopTex catalog yet — downloading now' : `saved catalog is ${Math.round(age)} h old — refreshing`);
    run();
  } else {
    log(`using saved TopTex catalog (${Math.round(age)} h old); next refresh in ${Math.round(hours - age)} h`);
  }
  if (hours > 0) setInterval(run, hours * 3_600_000).unref();
}
