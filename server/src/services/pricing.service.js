// Prices an order from the server-side catalog (never trusts prices sent by the browser).
import { config } from '../config.js';
import { getSku, skuWeightKg } from './catalog.service.js';
import { quoteShipping } from './shipping/index.js';
import { HttpError } from '../lib/http.js';

const r2 = (n) => Math.round(n * 100) / 100;
const PLACEMENT_IDS = new Set([
  'front-left', 'front-band', 'front-large', 'front-right', 'front-top', 'front-bottom',
  'back-top', 'back-large', 'back-centre', 'back-bottom',
  'left-top', 'left-mid', 'left-bottom', 'right-top', 'right-mid', 'right-bottom',
  // Design studio print zones (src/lib/garments.js in the web app)
  'tee-front-chest', 'tee-front-pocket', 'tee-front-full', 'tee-back-full', 'tee-back-shoulders',
  'cap-front-head', 'cap-front-visor', 'cap-left-side', 'cap-right-side', 'cap-back-centre',
]);

const PLACEMENT_LABELS = {
  'tee-front-chest': 'Front — chest', 'tee-front-pocket': 'Front — pocket', 'tee-front-full': 'Front — whole front',
  'tee-back-full': 'Back — whole back', 'tee-back-shoulders': 'Back — shoulder to shoulder',
  'cap-front-head': 'Cap front — head', 'cap-front-visor': 'Cap front — sun shade', 'cap-back-centre': 'Cap back — centre',
  'cap-left-side': 'Cap — left side', 'cap-right-side': 'Cap — right side',
};
/** Readable placement name for invoices and admin screens. */
export const placementLabel = (id) => PLACEMENT_LABELS[id] || id;

const num = (v, a, b, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : d; };
const id = (v) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
/** Keeps only well-formed design-studio items for the priced placements (text, font, colour, position, upload ids). */
function cleanDesign(cu, placements) {
  if (!Array.isArray(cu?.designs) || !cu.designs.length) return null;
  const items = cu.designs.slice(0, 12).filter((d) => placements.includes(d?.zone)).map((d) => {
    const base = { zone: d.zone, kind: d.kind === 'image' ? 'image' : 'text', x: num(d.x, -0.5, 0.5), y: num(d.y, -0.5, 0.5), scale: num(d.scale, 0.1, 1, 0.9), rotate: Math.round(num(d.rotate, -180, 180)) };
    return base.kind === 'image'
      ? { ...base, name: String(d.name || 'artwork').slice(0, 200), uploadId: id(d.uploadId) }
      : { ...base, text: String(d.text || '').slice(0, 200), font: String(d.font || '').slice(0, 40), color: /^#[0-9a-f]{6}$/i.test(d.color) ? d.color : '#000000', bold: !!d.bold };
  });
  return items.length ? { garment: ['tshirt', 'cap'].includes(cu.garment) ? cu.garment : null, mockupUploadId: id(cu.mockupUploadId), items } : null;
}

export function markingCost(type, placements, qty) {
  if (!type || !placements?.length) return 0;
  const rate = config.marking[type];
  if (!rate) throw new HttpError(400, `Unknown customisation type "${type}"`);
  return r2(placements.length * (rate.setup + rate.perUnit * qty));
}

/**
 * @param {{sku:string, qty:number, customisation?:{type:string, placements:string[], artworkUploadId?:number}}[]} lines
 * @returns priced lines + totals (shipping not included)
 */
export function priceLines(lines) {
  if (!Array.isArray(lines) || !lines.length) throw new HttpError(400, 'The cart is empty');
  let weightKg = 0;
  const priced = lines.map((l) => {
    const hit = getSku(l.sku);
    if (!hit) throw new HttpError(400, `Product ${l.sku} is no longer available`);
    const qty = parseInt(l.qty, 10);
    if (!(qty > 0 && qty <= 9999)) throw new HttpError(400, `Invalid quantity for ${l.sku}`);
    const { product: p, color: c, size: s } = hit;
    if (s.discontinued) throw new HttpError(400, `${p.name} ${c.name} ${s.size} is discontinued`);

    const cu = l.customisation;
    const placements = (cu?.placements || []).filter((x) => PLACEMENT_IDS.has(x));
    const type = placements.length || cu?.artworkUploadId ? (cu?.type === 'Embroidery' ? 'Embroidery' : 'Printing') : null;
    const marking = markingCost(type, placements, qty);
    weightKg += qty * skuWeightKg(l.sku, config.shipping.defaultItemWeightKg);
    return {
      sku: s.sku, catalogRef: p.id, slug: p.slug, name: p.name, brand: p.brand, color: c.name, size: s.size,
      image: c.shots[0]?.url || p.images[0] || null,
      qty, unitPrice: s.price, goodsTotal: r2(qty * s.price),
      customisation: type ? { type, placements, artworkUploadId: cu.artworkUploadId || null, design: cleanDesign(cu, placements) } : null,
      markingTotal: marking,
    };
  });
  const goodsTotal = r2(priced.reduce((n, l) => n + l.goodsTotal, 0));
  const markingTotal = r2(priced.reduce((n, l) => n + l.markingTotal, 0));
  const fulfilmentType = priced.some((l) => l.customisation) ? 'customised' : 'direct';
  return { lines: priced, goodsTotal, markingTotal, weightKg: Math.round(weightKg * 1000) / 1000, fulfilmentType };
}

/** Full quote: goods + marking + shipping options + VAT for a destination. */
export async function quoteOrder({ lines, address, shippingMethod }) {
  const base = priceLines(lines);
  const options = address?.country ? await quoteShipping({ address, weightKg: base.weightKg, goodsTotal: base.goodsTotal }) : [];
  const chosen = options.find((o) => o.code === shippingMethod) || null;
  const shippingCost = chosen ? chosen.cost : 0;
  const net = r2(base.goodsTotal + base.markingTotal + shippingCost);
  const taxTotal = r2(net * config.taxRate);
  return {
    ...base,
    shippingOptions: options,
    shipping: chosen,
    shippingCost,
    taxRate: config.taxRate,
    taxTotal,
    grandTotal: r2(net + taxTotal),
    currency: config.currency,
  };
}
