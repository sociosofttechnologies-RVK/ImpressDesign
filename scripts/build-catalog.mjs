// Converts the raw TopTex inventory export into the compact catalog the app ships.
// Usage: node scripts/build-catalog.mjs [path/to/inventory.json] [lang]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2] || path.join(root, 'data/topTex_Inventory.json');
const lang = process.argv[3] || 'en';
const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
const items = Array.isArray(raw) ? raw : raw.items;

const t = (v) => (v && typeof v === 'object' ? (v[lang] || v.en || '') : v || '').toString().replace(/ /g, ' ').trim();
const list = (arr) => (Array.isArray(arr) ? arr.map(t).filter(Boolean) : []);
const price = (s) => { const n = parseFloat(String(s || '').replace(/[^\d,.-]/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const slug = (s) => s.toLowerCase().replace(/[®™©]/g, '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-');
const SHOT_ORDER = ['FACE', 'FACE CAP', 'FACE SIDE', 'SIDE', 'BACK', 'FLATSHOT FACE', 'FLATSHOT BACK'];
const GENDER = { "Men's": 'Men', "Ladies'": 'Women', Unisex: 'Unisex', Kids: 'Kids', Children: 'Kids', Baby: 'Kids' };

const products = items.map((p) => {
  const colors = (p.colors || []).map((c) => {
    const shots = Object.entries(c.packshots || {})
      .sort((a, b) => (SHOT_ORDER.indexOf(a[0]) + 99) % 99 - (SHOT_ORDER.indexOf(b[0]) + 99) % 99)
      .map(([view, v]) => ({ view, url: v.url_packshot })).filter((s) => s.url);
    const sizes = (c.sizes || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).map((s) => ({
      size: s.size, sku: s.sku, ean: s.ean, price: price(s.publicUnitPrice),
      pack: s.unitsPerPack || null, box: s.unitsPerBox || null, origin: (s.countryOfOrigin || []).join(', '),
      isNew: !!s.isNew, discontinued: !!s.isDiscontinued,
      dims: Object.fromEntries([['Head circumference', s.headCircumferenceCm], ['Width', s.width], ['Height', s.height], ['Length', s.length], ['Diameter', s.diameter], ['Dimensions', s.dimensions], ['Chest', s.chestCircumferenceCm], ['Waist', s.waistSizeCm]].filter(([, v]) => v)),
    }));
    return { name: t(c.colors), hex: (c.colorsHexa || []).filter(Boolean).map((h) => '#' + h), family: list(c.colorsDominant), shots, sizes };
  }).filter((c) => c.sizes.length);
  const prices = colors.flatMap((c) => c.sizes.map((s) => s.price)).filter((n) => n != null);
  const organic = list(p.organic), recycled = (p.recycled || []).filter(Boolean);
  const name = t(p.designation).replace(/\.$/, '');
  return {
    id: p.catalogReference, slug: `${slug(name)}-${p.catalogReference.toLowerCase()}`,
    brand: (p.brand || '').replace(/[®™]/g, '').trim(), name, description: t(p.description), composition: t(p.composition),
    family: t(p.family), category: t(p.sub_family), type: list(p.style)[0] || t(p.sub_family),
    gender: [...new Set(list(p.gender).map((g) => GENDER[g] || g))], weight: p.averageWeight || '',
    eco: [...organic.map((o) => `Organic (${o})`), ...recycled.map(() => 'Recycled')].filter((v, i, a) => a.indexOf(v) === i),
    highlights: [p.salesArguments, p.salesArguments2, p.salesArguments3].map(t).filter(Boolean),
    features: [...list(p.panelsNumber), ...list(p.typeFastening), ...list(p.typeWeaving), ...(p.pictograms?.additionnalPictograms || []).map((x) => t(x.caption))].filter(Boolean),
    images: (p.images || []).map((i) => i.url_image).filter(Boolean),
    techFile: t(p.technicalFiles) ? 'https://' + t(p.technicalFiles).replace(/^https?:\/\//, '') : '',
    active: p.saleState === 'active', priceFrom: prices.length ? Math.min(...prices) : null, priceTo: prices.length ? Math.max(...prices) : null,
    colors,
  };
}).filter((p) => p.colors.length);

const out = path.join(root, 'src/data/catalog.json');
fs.writeFileSync(out, JSON.stringify({ generatedFrom: path.basename(src), sourceTotal: raw.total_count ?? items.length, products }));
console.log(`${products.length} products, ${products.reduce((n, p) => n + p.colors.length, 0)} colours -> ${path.relative(root, out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
