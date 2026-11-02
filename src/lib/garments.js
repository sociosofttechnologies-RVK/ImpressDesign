// Garment mock-ups for the design studio: vector templates (front + back) and the print zones
// customers can decorate. Zone boxes are [x, y, w, h] in the template's viewBox units.
// Zone ids are also accepted by the API (server/src/services/pricing.service.js) — keep both in sync.

export const GARMENTS = {
  tshirt: {
    name: 'T-shirt',
    viewBox: [400, 460],
    sides: {
      Front: {
        body: 'M150,38 Q200,92 250,38 L318,58 Q356,74 384,114 L350,160 L302,142 L306,424 Q200,436 94,424 L98,142 L50,160 L16,114 Q44,74 82,58 Z',
        parts: [
          { d: 'M150,38 Q200,56 250,38 Q200,92 150,38 Z', tone: 'inner' },
          { d: 'M146,36 Q200,100 254,36 L246,37 Q200,86 154,37 Z', tone: 'dark' },
        ],
        seams: [
          'M318,58 Q306,100 302,142', 'M82,58 Q94,100 98,142',
          'M56,152 L100,136', 'M344,152 L300,136',
          'M97,414 Q200,426 303,414',
        ],
      },
      Back: {
        body: 'M150,38 Q200,56 250,38 L318,58 Q356,74 384,114 L350,160 L302,142 L306,424 Q200,436 94,424 L98,142 L50,160 L16,114 Q44,74 82,58 Z',
        parts: [{ d: 'M146,36 Q200,62 254,36 L246,37 Q200,50 154,37 Z', tone: 'dark' }],
        seams: [
          'M318,58 Q306,100 302,142', 'M82,58 Q94,100 98,142',
          'M56,152 L100,136', 'M344,152 L300,136',
          'M97,414 Q200,426 303,414',
        ],
      },
    },
    zones: [
      { id: 'tee-front-chest', side: 'Front', label: 'Chest', hint: 'approx. 25 × 13 cm', box: [135, 100, 130, 70] },
      { id: 'tee-front-pocket', side: 'Front', label: 'Pocket', hint: 'left chest · approx. 10 × 10 cm', box: [226, 96, 56, 56] },
      { id: 'tee-front-full', side: 'Front', label: 'Whole front', hint: 'approx. 30 × 40 cm', box: [118, 96, 164, 250] },
      { id: 'tee-back-full', side: 'Back', label: 'Whole back', hint: 'approx. 30 × 40 cm', box: [118, 112, 164, 250] },
      { id: 'tee-back-shoulders', side: 'Back', label: 'Shoulder to shoulder', hint: 'approx. 35 × 8 cm', box: [104, 60, 192, 46] },
    ].map((z) => ({ ...z, cm: [Number(z.hint.match(/(\d+) ×/)[1]), Math.round((Number(z.hint.match(/(\d+) ×/)[1]) * z.box[3]) / z.box[2])] })),
  },
  // The cap is drawn in 3D (src/lib/cap3d.js). Zones are measured in cm on the cap surface:
  // crown zones by direction (deg: 0 = front, 90 = wearer's left) and height above the band (s, cm);
  // the sun-shade zone by its position on the peak (u across, v from the crown to the tip).
  cap: {
    name: 'Cap',
    three: true,
    sides: { Front: {}, Left: {}, Back: {}, Right: {} },
    zones: [
      { id: 'cap-front-head', side: 'Front', label: 'Front — head', hint: 'front panel · up to 11 × 6.5 cm', surface: 'crown', deg: 0, s: 5.6, w: 11, h: 6.5 },
      { id: 'cap-front-visor', side: 'Front', label: 'Front — sun shade', hint: 'on the peak · up to 11 × 3 cm', surface: 'visor', u: 0.5, v: 0.5, w: 11, h: 3, view: { az: 0, pol: 52 } },
      { id: 'cap-left-side', side: 'Left', label: 'Left side', hint: 'as worn · up to 7 × 4 cm', surface: 'crown', deg: 90, s: 4.6, w: 7, h: 4 },
      { id: 'cap-right-side', side: 'Right', label: 'Right side', hint: 'as worn · up to 7 × 4 cm', surface: 'crown', deg: 270, s: 4.6, w: 7, h: 4 },
      { id: 'cap-back-centre', side: 'Back', label: 'Back — centre', hint: 'above the strap · up to 8 × 3.5 cm', surface: 'crown', deg: 180, s: 7.6, w: 8, h: 3.5 },
    ].map((z) => ({ ...z, box: [-z.w / 2, -z.h / 2, z.w, z.h], cm: [z.w, z.h] })),
  },
};

export const ZONES = Object.fromEntries(Object.values(GARMENTS).flatMap((g) => g.zones.map((z) => [z.id, { ...z, garment: g.name }])));

/** Readable name for a placement id (studio zones and the older generic placements). */
export const placementLabel = (id) => {
  const z = ZONES[id];
  if (z) return z.garment === 'Cap' ? `Cap — ${z.label.toLowerCase()}` : `${z.side} — ${z.label.toLowerCase()}`;
  return id.replace('-', ' — ').replace(/^\w/, (c) => c.toUpperCase());
};

/** Which studio template fits a catalog product, or null when the product uses the generic placement picker. */
export function garmentKind(p) {
  if (!p) return null;
  const t = `${p.type || ''} ${p.category || ''} ${p.name || ''}`.toLowerCase();
  if (/beanie|bonnet|bob\b|bucket|visor only/.test(t)) return null;
  if (/\bcaps?\b|casquette|trucker|snapback/.test(t)) return 'cap';
  if (/t-?shirts?\b|\btees?\b/.test(t) && !/long[- ]?sleeve|polo|sweat|hood|tank|vest/.test(t)) return 'tshirt';
  return null;
}

// ------------------------------------------------------------------ colours
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function parseHex(hex) {
  let h = String(hex || '#ffffff').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [255, 255, 255];
}
const toHex = (rgb) => `#${rgb.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}`;
export const shade = (hex, amt) => toHex(parseHex(hex).map((v) => (amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
export const luminance = (hex) => { const [r, g, b] = parseHex(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

function palette(colors) {
  const base = colors?.[0] || '#ffffff';
  const alt = colors?.[1] || base;
  const light = luminance(base) > 0.82;
  const tones = (c) => ({ base: c, dark: shade(c, light ? -0.1 : -0.22), inner: shade(c, light ? -0.2 : -0.38), buckle: '#8d8d8d' });
  return { main: tones(base), alt: tones(alt), stroke: light ? '#b9b9b9' : shade(base, -0.45), seam: light ? 'rgba(0,0,0,.22)' : 'rgba(0,0,0,.35)' };
}

// ------------------------------------------------------------------ SVG markup (shared by the live preview and the PNG export)
/** Garment drawing beneath the artwork. */
export function garmentBaseMarkup(kind, side, colors) {
  const g = GARMENTS[kind].sides[side];
  const pal = palette(colors);
  const out = [];
  out.push(`<path d="${g.body}" fill="${pal.main.base}" stroke="${pal.stroke}" stroke-width="1.6" stroke-linejoin="round"/>`);
  for (const p of g.parts) {
    const t = (p.alt ? pal.alt : pal.main)[p.tone];
    out.push(`<path d="${p.d}" fill="${t}" stroke="${pal.stroke}" stroke-width="1.2" stroke-linejoin="round"/>`);
  }
  for (const s of g.seams) out.push(`<path d="${s}" fill="none" stroke="${pal.seam}" stroke-width="1.1" stroke-dasharray="3 3"/>`);
  for (const [x, y] of g.eyelets || []) out.push(`<circle cx="${x}" cy="${y}" r="3.2" fill="${pal.main.inner}" stroke="${pal.stroke}" stroke-width=".8"/>`);
  return out.join('');
}

/** Soft fabric shading laid over the artwork (multiply) so prints sit "in" the garment. */
export function garmentShadeMarkup(kind, side, uid = 's') {
  const g = GARMENTS[kind].sides[side];
  const [w] = GARMENTS[kind].viewBox;
  return [
    `<defs><linearGradient id="${uid}-h" x1="0" x2="${w}" y1="0" y2="0" gradientUnits="userSpaceOnUse">`,
    '<stop offset="0" stop-color="#000" stop-opacity=".16"/><stop offset=".22" stop-color="#000" stop-opacity="0"/>',
    '<stop offset=".78" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".16"/></linearGradient>',
    '</defs>',
    `<path d="${g.body}" fill="url(#${uid}-h)"/>`,
  ].join('');
}

// ------------------------------------------------------------------ design geometry
export const FONTS = [
  { id: 'bebas', label: 'Bebas Neue', css: "'Bebas Neue'" },
  { id: 'oswald', label: 'Oswald', css: "'Oswald'" },
  { id: 'inter', label: 'Inter', css: "'Inter'" },
  { id: 'slab', label: 'Roboto Slab', css: "'Roboto Slab'" },
  { id: 'marker', label: 'Permanent Marker', css: "'Permanent Marker'" },
  { id: 'pacifico', label: 'Pacifico', css: "'Pacifico'" },
];
export const fontCss = (id) => (FONTS.find((f) => f.id === id) || FONTS[0]).css;
export const INK = ['#000000', '#ffffff', '#c41c00', '#f2d21f', '#1f4fa3', '#1a7f37', '#ff7a1a', '#7a3db8', '#f28cab', '#8a8a8a', '#b8902f', '#0b2545'];

/** Approximate printed size (cm) of a design in its zone. */
export function printSize(design, zone) {
  const L = layout(design, zone);
  const k = zone.cm[0] / zone.box[2];
  return [Math.round(L.w * k * 10) / 10, Math.round(L.h * k * 10) / 10];
}

const LINE_H = 1.18;
let measureCtx;
function textWidth(line, font, bold) {
  measureCtx ||= document.createElement('canvas').getContext('2d');
  measureCtx.font = `${bold ? 700 : 400} 100px ${fontCss(font)}, sans-serif`;
  return Math.max(measureCtx.measureText(line || ' ').width, 1);
}

export const textLines = (d) => String(d.text || '').split('\n').map((l) => l.trimEnd()).filter((l, i, a) => l || i < a.length - 1).slice(0, 4);

/** Where a design sits inside its zone: centre, size and (for text) font size, all in viewBox units. */
export function layout(design, zone) {
  const [zx, zy, zw, zh] = zone.box;
  const s = clamp(design.scale ?? 0.9, 0.1, 1);
  const maxW = zw * s, maxH = zh * s;
  // The artwork is kept inside its print area: it can move only as far as its own size allows.
  const place = (w, h) => ({
    cx: zx + zw / 2 + clamp(design.x || 0, -0.5, 0.5) * Math.max(0, zw - w),
    cy: zy + zh / 2 + clamp(design.y || 0, -0.5, 0.5) * Math.max(0, zh - h),
  });
  if (design.kind === 'image') {
    const a = design.aspect || 1;
    const w = Math.min(maxW, maxH * a);
    return { ...place(w, w / a), w, h: w / a };
  }
  const lines = textLines(design);
  const widest = Math.max(...lines.map((l) => textWidth(l, design.font, design.bold)), 1);
  const fs = Math.min((maxW * 100) / widest, maxH / (lines.length * LINE_H));
  const w = (widest * fs) / 100, h = lines.length * LINE_H * fs;
  return { ...place(w, h), w, h, fs, lines, lineH: LINE_H * fs };
}

export const hasContent = (d) => !!d && (d.kind === 'image' ? !!d.src : textLines(d).some(Boolean));

// ------------------------------------------------------------------ export
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
const svgUrl = (inner, [w, h]) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${inner}</svg>`)}`;

/** Wait for the web fonts a set of designs uses (canvas text falls back silently otherwise). */
export async function ensureFonts(designs) {
  if (!document.fonts?.load) return;
  const used = [...new Set(designs.filter((d) => d.kind === 'text').map((d) => `${d.bold ? 700 : 400} 40px ${fontCss(d.font)}`))];
  await Promise.all(used.map((f) => document.fonts.load(f).catch(() => null)));
}

/**
 * Renders the customised garment (front and back side by side) to a JPEG data URL.
 * @param {'tshirt'|'cap'} kind
 * @param {string[]} colors garment hex colours
 * @param {Record<string, object>} designs by zone id
 */
export async function renderMockup(kind, colors, designs, { width = 1200, quality = 0.88 } = {}) {
  if (GARMENTS[kind].three) return (await import('./cap3d.js')).renderCapMockup(colors, designs, { width, quality });
  const g = GARMENTS[kind];
  const [vw, vh] = g.viewBox;
  const list = Object.values(designs).filter(hasContent);
  await ensureFonts(list);
  const pad = 24, label = 34;
  const sw = (width - pad * 3) / 2, k = sw / vw, sh = vh * k;
  const c = document.createElement('canvas');
  c.width = width; c.height = Math.round(sh + pad * 2 + label);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f4f3f1'; ctx.fillRect(0, 0, c.width, c.height);
  const sides = Object.keys(g.sides);
  for (const [si, side] of sides.entries()) {
    const ox = pad + si * (sw + pad), oy = pad;
    ctx.drawImage(await loadImg(svgUrl(garmentBaseMarkup(kind, side, colors), g.viewBox)), ox, oy, sw, sh);
    for (const zone of g.zones.filter((z) => z.side === side)) {
      const d = designs[zone.id];
      if (!hasContent(d)) continue;
      const L = layout(d, zone);
      const [zx, zy, zw, zh] = zone.box;
      ctx.save();
      ctx.translate(ox, oy); ctx.scale(k, k);
      ctx.clip(new Path2D(g.sides[side].body));
      ctx.beginPath(); ctx.rect(zx, zy, zw, zh); ctx.clip();
      ctx.translate(L.cx, L.cy); ctx.rotate(((d.rotate || 0) * Math.PI) / 180);
      if (d.kind === 'image') {
        ctx.drawImage(await loadImg(d.src), -L.w / 2, -L.h / 2, L.w, L.h);
      } else {
        ctx.fillStyle = d.color || '#000';
        ctx.font = `${d.bold ? 700 : 400} ${L.fs}px ${fontCss(d.font)}, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        L.lines.forEach((ln, i) => ctx.fillText(ln, 0, -L.h / 2 + (i + 0.5) * L.lineH));
      }
      ctx.restore();
    }
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(await loadImg(svgUrl(garmentShadeMarkup(kind, side, `x${si}`), g.viewBox)), ox, oy, sw, sh);
    ctx.restore();
    ctx.fillStyle = '#6b6866'; ctx.font = "600 18px 'Inter', sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(side.toUpperCase(), ox + sw / 2, c.height - pad + 4);
  }
  return c.toDataURL('image/jpeg', quality);
}

export const dataUrlToBlob = async (url) => (await fetch(url)).blob();

/** Downscales an uploaded raster image for the on-screen preview (the original file still goes to the workshop). */
export async function previewFromFile(file, max = 1400) {
  const raw = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  const img = await loadImg(raw);
  const w = img.naturalWidth || img.width || 1, h = img.naturalHeight || img.height || 1;
  if (file.type === 'image/svg+xml' || Math.max(w, h) <= max) return { src: raw, aspect: w / h, px: [w, h] };
  const k = max / Math.max(w, h);
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return { src: c.toDataURL('image/png'), aspect: w / h, px: [w, h] };
}
