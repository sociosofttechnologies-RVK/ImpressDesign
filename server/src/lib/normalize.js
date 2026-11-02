// Converts a raw TopTex catalog item into the compact product shape used by the storefront.
// Same mapping as scripts/build-catalog.mjs in the web app, plus product weight for shipping.

export function makeNormalizer(lang = 'en') {
  const t = (v) => (v && typeof v === 'object' ? (v[lang] || v.en || '') : v || '').toString().replace(/ /g, ' ').trim();
  const list = (arr) => (Array.isArray(arr) ? arr.map(t).filter(Boolean) : []);
  const price = (s) => { const n = parseFloat(String(s ?? '').replace(/[^\d,.-]/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
  const slug = (s) => s.toLowerCase().replace(/[®™©]/g, '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-');
  const SHOT_ORDER = ['FACE', 'FACE CAP', 'FACE SIDE', 'SIDE', 'BACK', 'FLATSHOT FACE', 'FLATSHOT BACK'];
  const GENDER = { "Men's": 'Men', "Ladies'": 'Women', Unisex: 'Unisex', Kids: 'Kids', Children: 'Kids', Baby: 'Kids' };

  return (p) => {
    const colors = (p.colors || []).map((c) => {
      const shots = Object.entries(c.packshots || {})
        .sort((a, b) => (SHOT_ORDER.indexOf(a[0]) + 99) % 99 - (SHOT_ORDER.indexOf(b[0]) + 99) % 99)
        .map(([view, v]) => ({ view, url: v.url_packshot })).filter((s) => s.url);
      const sizes = (c.sizes || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).map((s) => ({
        size: s.size, sku: s.sku, ean: s.ean, price: price(s.publicUnitPrice ?? s.prices?.[0]?.price),
        pack: s.unitsPerPack || null, box: s.unitsPerBox || null, origin: (s.countryOfOrigin || []).join(', '),
        isNew: !!s.isNew, discontinued: !!s.isDiscontinued,
        dims: Object.fromEntries([['Head circumference', s.headCircumferenceCm], ['Width', s.width], ['Height', s.height], ['Length', s.length], ['Diameter', s.diameter], ['Dimensions', s.dimensions], ['Chest', s.chestCircumferenceCm], ['Waist', s.waistSizeCm]].filter(([, v]) => v)),
      })).filter((s) => s.price != null);
      return { name: t(c.colors), hex: (c.colorsHexa || []).filter(Boolean).map((h) => '#' + h), family: list(c.colorsDominant), shots, sizes };
    }).filter((c) => c.sizes.length);
    if (!colors.length || !p.catalogReference) return null;
    const prices = colors.flatMap((c) => c.sizes.map((s) => s.price));
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
      active: p.saleState === undefined ? true : p.saleState === 'active',
      priceFrom: Math.min(...prices), priceTo: Math.max(...prices),
      colors,
    };
  };
}

// "65 g" / "180 g/m²" / "0,4 kg" -> kg. Grammage (g/m²) is not a garment weight, so it returns null.
export function parseWeightKg(w) {
  if (!w) return null;
  const s = String(w).toLowerCase();
  if (s.includes('/m')) return null;
  const n = parseFloat(s.replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return s.includes('kg') ? n : n / 1000;
}
