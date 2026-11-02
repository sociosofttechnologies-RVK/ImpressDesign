import data from '../data/catalog.json';

export const products = data.products;
export const sourceTotal = data.sourceTotal;

const bySlug = new Map(products.map((p) => [p.slug, p]));
export const getProduct = (slug) => bySlug.get(slug);

export const formatPrice = (n) => (n == null ? '' : `€${n.toFixed(2)}`);

const uniq = (arr) => [...new Set(arr)];
const SIZE_ORDER = ['One Size', 'XXS', 'XS', 'S', 'S/M', 'M', 'M/L', 'L', 'L/XL', 'XL', 'XXL', 'XXXL', '3XL', '4XL', '5XL'];
const sizeRank = (s) => { const i = SIZE_ORDER.indexOf(s); return i === -1 ? 999 : i; };

// Representative swatch for each dominant colour family used by the colour filter.
export const COLOR_FAMILIES = {
  White: '#ffffff', Black: '#1a1a1a', Blue: '#264d8c', Red: '#c41c00', Green: '#2d6a4f', Orange: '#ffa32e',
  Brown: '#935414', Beige: '#d8c8b4', Grey: '#999995', Yellow: '#f2d21f', Violet: '#6645a8', Pink: '#f28cab',
  Pattern: 'repeating-linear-gradient(45deg,#4b5a3c 0 3px,#8a8f6a 3px 6px,#2f3a2a 6px 9px)',
};

function buildFacets(products) {
  const catCount = products.reduce((m, p) => m.set(p.category, (m.get(p.category) || 0) + 1), new Map());
  const prices = products.map((p) => p.priceFrom).filter((n) => n != null);
  return {
    categories: [...catCount.keys()].sort((a, b) => catCount.get(b) - catCount.get(a)),
    sizes: uniq(products.flatMap((p) => p.colors.flatMap((c) => c.sizes.map((s) => s.size)))).sort((a, b) => sizeRank(a) - sizeRank(b)),
    colors: Object.keys(COLOR_FAMILIES).filter((f) => products.some((p) => p.colors.some((c) => (c.family || []).includes(f)))),
    genders: ['Men', 'Women', 'Unisex', 'Kids'],
    types: uniq(products.map((p) => p.type)).sort(),
    ecoCount: products.filter((p) => p.eco?.length).length,
    priceMin: prices.length ? Math.floor(Math.min(...prices)) : 0,
    priceMax: prices.length ? Math.ceil(Math.max(...prices)) : 0,
    total: products.length,
  };
}

export const facets = buildFacets(products);

export const productSizes = (p) => uniq(p.colors.flatMap((c) => c.sizes.map((s) => s.size))).sort((a, b) => sizeRank(a) - sizeRank(b));

export const swatchStyle = (hex) => {
  if (!hex || !hex.length) return { background: '#ddd' };
  if (hex.length === 1) return { background: hex[0] };
  return { background: `linear-gradient(90deg, ${hex[0]} 50%, ${hex[1]} 50%)` };
};

export const primaryShot = (p, colorIndex = 0) => p.colors[colorIndex]?.shots[0]?.url || p.images[0] || '';

function filterIn(products, hay, { category, q, sizes = [], colors = [], genders = [], eco, maxPrice, types = [] }) {
  const needle = (q || '').trim().toLowerCase();
  return products.filter((p) => {
    if (category && p.category !== category) return false;
    if (needle && !hay(p).includes(needle)) return false;
    if (sizes.length && !p.colors.some((c) => c.sizes.some((s) => sizes.includes(s.size)))) return false;
    if (colors.length && !p.colors.some((c) => (c.family || []).some((f) => colors.includes(f)))) return false;
    if (genders.length && !(p.gender || []).some((g) => genders.includes(g))) return false;
    if (eco && !p.eco?.length) return false;
    if (maxPrice != null && p.priceFrom > maxPrice) return false;
    if (types.length && !types.includes(p.type)) return false;
    return true;
  });
}

function relatedIn(products, p, n = 4) {
  const same = products.filter((x) => x.id !== p.id && x.category === p.category);
  const rest = products.filter((x) => x.id !== p.id && x.category !== p.category);
  return [...same, ...rest].slice(0, n);
}

const plainHay = (p) => `${p.name} ${p.brand} ${p.id} ${p.category} ${p.type} ${p.description}`.toLowerCase();
export const filterProducts = (filters) => filterIn(products, plainHay, filters);
export const relatedProducts = (p, n) => relatedIn(products, p, n);

/** Same lookups as above, over any product list (used for the full offline catalog). */
export function createCatalog(list) {
  const bySlugAll = new Map(list.map((p) => [p.slug, p]));
  const hayMap = new Map(list.map((p) => [p, plainHay(p)])); // precomputed: keeps search fast on thousands of products
  return {
    size: list.length,
    facets: buildFacets(list),
    getProduct: (slug) => bySlugAll.get(slug),
    filterProducts: (filters) => filterIn(list, (p) => hayMap.get(p), filters),
    relatedProducts: (p, n) => relatedIn(list, p, n),
  };
}

export const bundledCatalog = { size: products.length, facets, getProduct, filterProducts, relatedProducts };
