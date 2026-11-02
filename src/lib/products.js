// Product data for the storefront. Reads from the API (paged, filtered on the server).
// If the local API is down, the full catalog is loaded once from /catalog/products.json — a static
// copy of every product, made from the downloaded TopTex export by `npm run catalog:offline`
// (runs automatically before `npm run dev` and `npm run build`). If that file is missing too,
// the small sample catalog bundled with the app is used.
import { api } from './api.js';
import * as local from './catalog.js';

const OFFLINE_URL = `${import.meta.env.BASE_URL}catalog/products.json`;
const RETRY_API_MS = 30_000; // after the API was found down, try it again after this long

let apiDownUntil = 0;
let offline = null;

/** The full offline catalog (fetched once), or the bundled sample if the file is unavailable. */
export function offlineCatalog() {
  offline ||= fetch(OFFLINE_URL)
    .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then((d) => {
      if (!Array.isArray(d?.products) || !d.products.length) throw new Error('no products');
      console.info(`[catalog] API unavailable — showing ${d.products.length} products from the offline catalog`);
      return local.createCatalog(d.products);
    })
    .catch((e) => {
      console.warn(`[catalog] offline catalog not available (${e.message}) — showing the bundled sample`);
      return local.bundledCatalog;
    });
  return offline;
}

async function tryApi(path, fallback) {
  if (Date.now() >= apiDownUntil) {
    try {
      const data = await api(path);
      // A host without the API can answer with an empty or non-JSON body; treat that as "API down" too.
      if (data && typeof data === 'object') return data;
      apiDownUntil = Date.now() + RETRY_API_MS;
    } catch (e) {
      // Down = no connection, a 5xx from the dev proxy, or a reply that is not from our API (e.g. a web server 404 page).
      const down = e.status === 0 || e.status >= 500 || !e.fromApi;
      if (!down) throw e;
      apiDownUntil = Date.now() + RETRY_API_MS;
    }
  }
  return fallback(await offlineCatalog());
}

const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length)).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : String(v)])).toString();

export function fetchProducts(filters, page, pageSize = 12) {
  return tryApi(`/products?${qs({ ...filters, eco: filters.eco ? 1 : '', page, pageSize })}`, (c) => {
    const all = c.filterProducts({ ...filters, category: filters.cat });
    const start = (page - 1) * pageSize;
    return { items: all.slice(start, start + pageSize), page, pageSize, total: all.length, hasMore: start + pageSize < all.length };
  });
}

export const fetchFacets = () => tryApi('/products/facets', (c) => c.facets);

export async function fetchProduct(slug) {
  try {
    return await tryApi(`/products/${encodeURIComponent(slug)}`, (c) => {
      const p = c.getProduct(slug);
      return p ? { product: p, related: c.relatedProducts(p) } : null;
    });
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

/** Instant first paint for a product page from the bundled sample (replaced once real data arrives). */
export const localProduct = (slug) => {
  const p = local.getProduct(slug);
  return p ? { product: p, related: local.relatedProducts(p) } : null;
};
