import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ProductImage from '../components/ProductImage.jsx';
import ImageZoom from '../components/ImageZoom.jsx';
import ProductCard from '../components/ProductCard.jsx';
import Faq from '../components/Faq.jsx';
import QuoteCta from '../components/QuoteCta.jsx';
import Placeholder from './Placeholder.jsx';
import { Chevron, Close } from '../components/Icon.jsx';
import { useCart } from '../context/CartContext.jsx';
import { formatPrice, swatchStyle } from '../lib/catalog.js';
import { fetchProduct, localProduct } from '../lib/products.js';
import { api } from '../lib/api.js';
import { PLACEMENTS, SERVICES, TRUST } from '../lib/content.js';
import DesignStudio, { ZoneThumb, DesignOverview, useCapThumbs, useDesignDraft, ensureUploaded } from '../components/DesignStudio.jsx';
import { GARMENTS, garmentKind, hasContent, renderMockup, dataUrlToBlob } from '../lib/garments.js';

const TABS = ['Description', 'Size guide', 'Printing', 'Delivery', 'Decreasing prices'];
const VIEW_LABEL = { FACE: 'Front', 'FACE CAP': 'Front', 'FACE SIDE': 'Three-quarter', SIDE: 'Side', BACK: 'Back', 'FLATSHOT FACE': 'Flat front', 'FLATSHOT BACK': 'Flat back' };
const allPlacements = Object.values(PLACEMENTS).flat();

const r3 = (n) => Math.round((n || 0) * 1000) / 1000;
const hashStr = (str) => { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

/** The studio design as sent to the cart / API (no image data — images travel as upload ids). */
function serializeDesigns(kind, designs) {
  return GARMENTS[kind].zones.filter((z) => hasContent(designs[z.id])).map((z) => {
    const d = designs[z.id];
    const base = { zone: z.id, kind: d.kind, x: r3(d.x), y: r3(d.y), scale: r3(d.scale ?? 0.9), rotate: Math.round(d.rotate || 0) };
    return d.kind === 'image'
      ? { ...base, name: d.name || 'artwork', uploadId: d.uploadId || null }
      : { ...base, text: d.text.trim(), font: d.font, color: d.color, bold: !!d.bold };
  });
}

function StudioTile({ kind, zone, designs, colors, thumbs, onClick }) {
  const set = hasContent(designs[zone.id]);
  return (
    <button className={`ptile ptile--studio ${set ? 'is-on' : ''}`} title={zone.hint} onClick={onClick}>
      <ZoneThumb kind={kind} zone={zone} designs={designs} colors={colors} thumbs={thumbs} />
      <span>{zone.label}</span>
      {set && <span className="ptile__set">✓ {designs[zone.id].kind === 'image' ? 'Image' : 'Text'} added</span>}
    </button>
  );
}

function PlacementTile({ placement, selected, onClick }) {
  const [x, y, w, h] = placement.zone;
  return (
    <button className={`ptile ${selected ? 'is-on' : ''}`} aria-pressed={selected} title={placement.label} onClick={onClick}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <rect x="18" y="12" width="64" height="76" rx="6" fill="#fff" stroke="#111" strokeWidth="1.5" />
        <rect x={x} y={y} width={w} height={h} fill="#d2d2d2" />
      </svg>
      <span>{placement.label}</span>
    </button>
  );
}

export default function Product({ onQuote }) {
  const { slug } = useParams();
  // Show the bundled copy instantly when there is one, then replace it with the live API data.
  const [data, setData] = useState(() => localProduct(slug));
  const [loadState, setLoadState] = useState('loading');
  useEffect(() => {
    let live = true;
    setData(localProduct(slug));
    setLoadState('loading');
    fetchProduct(slug)
      .then((d) => { if (live) { if (d) setData(d); setLoadState(d ? 'ok' : 'missing'); } })
      .catch(() => { if (live) setLoadState('error'); });
    return () => { live = false; };
  }, [slug]);
  const p = data?.product;
  const cart = useCart();
  const [ci, setCi] = useState(0);
  const [gi, setGi] = useState(0);
  const [qty, setQty] = useState({});
  const [type, setType] = useState('Printing');
  const [side, setSide] = useState('Front');
  const [showAll, setShowAll] = useState(false);
  const [placements, setPlacements] = useState([]);
  const [artwork, setArtwork] = useState(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [tab, setTab] = useState(TABS[0]);
  const [notice, setNotice] = useState('');
  const kind = garmentKind(p);
  const [designs, setDesigns] = useDesignDraft(kind);
  const [studioZone, setStudioZone] = useState(null); // zone id the studio opens on; null = closed
  const [busy, setBusy] = useState(false);
  const capThumbs = useCapThumbs(p?.colors[ci]?.hex || p?.colors[0]?.hex, designs, kind === 'cap' && !studioZone);

  useEffect(() => { setCi(0); setGi(0); setQty({}); setPlacements([]); setArtwork(null); setTab(TABS[0]); setNotice(''); setSide('Front'); setShowAll(false); setStudioZone(null); }, [slug]);
  useEffect(() => { setGi(0); setQty({}); }, [ci]);

  const color = p?.colors[ci] || p?.colors[0];
  const gallery = useMemo(() => {
    if (!p || !color) return [];
    return [
      ...color.shots.map((s) => ({ url: s.url, label: VIEW_LABEL[s.view] || s.view })),
      ...p.images.map((url) => ({ url, label: 'Lifestyle' })),
    ];
  }, [p, color]);

  if (!p) {
    if (loadState === 'loading') return <section className="container placeholder"><p className="muted">Loading product…</p></section>;
    return <Placeholder title={loadState === 'error' ? 'Could not load this product' : 'Product not found'} notFound={loadState !== 'error'} />;
  }

  const total = Object.values(qty).reduce((a, b) => a + b, 0);
  const amount = color.sizes.reduce((n, s) => n + (qty[s.sku] || 0) * s.price, 0);
  const unit = Math.min(...color.sizes.map((s) => s.price));
  const sides = kind ? Object.keys(GARMENTS[kind].sides) : showAll ? ['Front', 'Back', 'Left', 'Right'] : ['Front', 'Back'];
  const tiles = kind ? [] : PLACEMENTS[side].filter((pl) => showAll || pl.basic);
  const studioZones = kind ? GARMENTS[kind].zones.filter((z) => hasContent(designs[z.id])) : [];
  const usedCount = kind ? studioZones.length : placements.length;
  const setSize = (sku, v) => { setNotice(''); setQty((prev) => ({ ...prev, [sku]: Math.max(0, Math.min(9999, Number.isFinite(v) ? v : 0)) })); };
  const togglePlacement = (id) => setPlacements((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  async function addStudioToCart() {
    if (Object.values(designs).some((d) => d?.uploading)) { setNotice('Wait for the image upload to finish.'); return; }
    setBusy(true);
    try {
      let ds = designs;
      if (studioZones.length) ds = await ensureUploaded(designs, setDesigns);
      let customisation = null;
      let image = color.shots[0]?.url || p.images[0] || '';
      if (studioZones.length) {
        const items = serializeDesigns(kind, ds);
        const [full, thumb] = await Promise.all([renderMockup(kind, color.hex, ds), renderMockup(kind, color.hex, ds, { width: 480, quality: 0.8 })]);
        let mockupUploadId = null;
        try {
          const fd = new FormData();
          fd.append('file', await dataUrlToBlob(full), `mockup-${p.id}-${color.name}.jpg`.replace(/[^\w.-]+/g, '-'));
          mockupUploadId = (await api('/uploads', { method: 'POST', form: fd })).id;
        } catch { /* API offline: the design spec still travels with the cart */ }
        const images = items.filter((d) => d.kind === 'image');
        customisation = {
          type, garment: kind,
          placements: items.map((d) => d.zone),
          placementLabels: studioZones.map((z) => z.label.toLowerCase()),
          artwork: [...images.map((d) => d.name), ...items.filter((d) => d.kind === 'text').map((d) => `“${d.text.replace(/\n/g, ' ')}”`)].join(', '),
          artworkUploadId: images.find((d) => d.uploadId)?.uploadId || null,
          mockupUploadId,
          designs: items,
          designKey: hashStr(JSON.stringify([color.name, items])),
          preview: thumb,
        };
        image = thumb;
      }
      cart.add(color.sizes.filter((s) => qty[s.sku] > 0).map((s) => ({
        sku: s.sku, ref: p.id, slug: p.slug, name: p.name, brand: p.brand, color: color.name, size: s.size,
        price: s.price, qty: qty[s.sku], image, customisation,
      })));
      setQty({});
      setNotice('');
    } catch (e) {
      setNotice(`Could not prepare your design: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  const addToCart = () => {
    if (!total) { setNotice('Choose a quantity for at least one size.'); return; }
    if (kind) { addStudioToCart(); return; }
    if (artwork?.uploading) { setNotice('Wait for the artwork upload to finish.'); return; }
    if (artwork && !placements.length) { setNotice('Pick at least one placement for your artwork, or remove the artwork.'); return; }
    const customisation = placements.length || artwork
      ? { type, placements, placementLabels: placements.map((id) => { const pl = allPlacements.find((x) => x.id === id); return `${id.split('-')[0]} ${pl.label}`.toLowerCase(); }), artwork: artwork?.name || '', artworkUploadId: artwork?.uploadId || null }
      : null;
    cart.add(color.sizes.filter((s) => qty[s.sku] > 0).map((s) => ({
      sku: s.sku, ref: p.id, slug: p.slug, name: p.name, brand: p.brand, color: color.name, size: s.size,
      price: s.price, qty: qty[s.sku], image: color.shots[0]?.url || p.images[0] || '', customisation,
    })));
    setQty({});
    setNotice('');
  };

  async function uploadArtwork(f) {
    if (!f) { setArtwork(null); return; }
    const preview = f.type.startsWith('image/') ? URL.createObjectURL(f) : '';
    setArtwork({ name: f.name, url: preview, uploading: true });
    try {
      const fd = new FormData();
      fd.append('file', f);
      const r = await api('/uploads', { method: 'POST', form: fd });
      setArtwork({ name: f.name, url: preview, uploadId: r.id });
    } catch (e) {
      setArtwork({ name: f.name, url: preview, error: e.message });
    }
  }

  const sizeRows = color.sizes;
  const dimCols = [...new Set(sizeRows.flatMap((s) => Object.keys(s.dims)))];

  return (
    <div className="page">
      <div className="container">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link to="/">Home</Link><Chevron dir="right" size={12} />
          <Link to="/clothing">Clothing</Link><Chevron dir="right" size={12} />
          <Link to={`/clothing?cat=${encodeURIComponent(p.category)}`}>{p.category}</Link><Chevron dir="right" size={12} />
          <Link to={`/clothing?q=${encodeURIComponent(p.brand)}`}>{p.brand}</Link><Chevron dir="right" size={12} />
          <span>{p.name} {p.id}</span>
        </nav>

        <div className="pdp">
          <div className="pdp__gallery">
            <div className="thumbs">
              {gallery.map((g, i) => (
                <button key={g.url} className={`thumb ${i === gi ? 'is-on' : ''}`} aria-label={`${g.label} view`} aria-pressed={i === gi} onClick={() => setGi(i)}>
                  <ProductImage src={g.url} alt="" label={g.label} />
                </button>
              ))}
            </div>
            <div className="pdp__main">
              <ImageZoom gallery={gallery} index={gi} onIndex={setGi} alt={`${p.name} — ${color.name}`} label={`${p.id} · ${color.name}`} />
            </div>
          </div>

          <div className="pdp__info">
            <h1 className="pdp__title">{p.name} {p.id}</h1>
            <p className="pdp__brand">{p.brand}</p>
            <div className="pdp__price">
              <strong>{formatPrice(unit)}</strong>
              <span className="muted small">per unit, unmarked{!p.active ? ' · discontinued item' : ''}</span>
            </div>

            <div className="pdp__colors" role="group" aria-label="Colour">
              {p.colors.map((c, i) => (
                <button key={c.name} className={`dot dot--xl ${i === ci ? 'is-on' : ''}`} style={swatchStyle(c.hex)} title={c.name} aria-label={c.name} aria-pressed={i === ci} onClick={() => setCi(i)} />
              ))}
            </div>
            <p className="pdp__colorname">Colour: <strong>{color.name}</strong></p>

            <div className="sizegrid">
              {color.sizes.map((s) => {
                const v = qty[s.sku] || 0;
                return (
                  <div key={s.sku} className={`sizecell ${v > 0 ? 'is-on' : ''}`}>
                    <span className="sizecell__label">{s.size}</span>
                    <input type="number" min="0" inputMode="numeric" aria-label={`Quantity, size ${s.size}`} value={v === 0 ? '0' : String(v)} onChange={(e) => setSize(s.sku, parseInt(e.target.value, 10))} onFocus={(e) => e.target.select()} />
                    <span className="sizecell__step">
                      <button aria-label={`Add one ${s.size}`} onClick={() => setSize(s.sku, v + 1)}><Chevron dir="up" size={12} /></button>
                      <button aria-label={`Remove one ${s.size}`} onClick={() => setSize(s.sku, v - 1)}><Chevron dir="down" size={12} /></button>
                    </span>
                  </div>
                );
              })}
            </div>

            <h2 className="pdp__label">Customisation type :</h2>
            <div className="ctype" role="radiogroup" aria-label="Customisation type">
              {['Printing', 'Embroidery'].map((t) => (
                <button key={t} role="radio" aria-checked={type === t} className={type === t ? 'is-on' : ''} onClick={() => setType(t)}>
                  <span>{t}</span><i />
                </button>
              ))}
            </div>

            <div className="pdp__placehead">
              <h2 className="pdp__label">{kind ? 'Print location :' : 'Select placement :'}</h2>
              {kind ? (
                <button className="link link--strong" onClick={() => setStudioZone(GARMENTS[kind].zones.find((z) => z.side === side)?.id)}>Open design studio →</button>
              ) : (
                <button className="link link--strong" onClick={() => { setShowAll((v) => !v); if (showAll && !['Front', 'Back'].includes(side)) setSide('Front'); }}>
                  {showAll ? '- Hide all customisation' : '+ View all customisation'}
                </button>
              )}
            </div>
            <div className="seg" role="tablist" aria-label="Garment side">
              {sides.map((s) => (
                <button key={s} role="tab" aria-selected={side === s} className={side === s ? 'is-on' : ''} onClick={() => setSide(s)}>{s}</button>
              ))}
            </div>
            <div className="ptiles">
              {tiles.map((pl) => <PlacementTile key={pl.id} placement={pl} selected={placements.includes(pl.id)} onClick={() => togglePlacement(pl.id)} />)}
              {kind && GARMENTS[kind].zones.filter((z) => z.side === side).map((z) => (
                <StudioTile key={z.id} kind={kind} zone={z} designs={designs} colors={color.hex} thumbs={capThumbs} onClick={() => setStudioZone(z.id)} />
              ))}
            </div>
            {kind && studioZones.length > 0 && (
              <div className={`pdp__design ${GARMENTS[kind].three ? 'pdp__design--3d' : ''}`} aria-label="Your design preview">
                <DesignOverview kind={kind} colors={color.hex} designs={designs} />
                {GARMENTS[kind].three && <p className="muted small">Drag to turn the cap</p>}
              </div>
            )}

            <div className="pdp__summary" aria-live="polite">
              {total > 0 && <p><strong>{total}</strong> unit{total === 1 ? '' : 's'} · <strong>{formatPrice(amount)}</strong> garments{usedCount ? ` · ${type.toLowerCase()} on ${usedCount} placement${usedCount === 1 ? '' : 's'}` : ''}</p>}
              {artwork && <p className="muted small">Artwork: {artwork.name}{artwork.uploading ? ' — uploading…' : artwork.uploadId ? ' — uploaded' : ''}{artwork.error ? ` — ${artwork.error}` : ''}</p>}
              {total > 0 && !usedCount && !artwork && <p className="muted small">No customisation: these garments ship directly from our supplier to you.</p>}
              {notice && <p className="pdp__notice">{notice}</p>}
            </div>
            <div className="pdp__actions">
              <button className="btn btn--outline btn--block" onClick={() => (kind ? setStudioZone(GARMENTS[kind].zones[0].id) : setCustomOpen(true))}>
                {kind && studioZones.length ? 'Edit design' : 'Customise now'}
              </button>
              <button className="btn btn--primary btn--block" onClick={addToCart} disabled={busy}>{busy ? 'Preparing design…' : 'Add to cart'}</button>
            </div>
          </div>
        </div>

        <div className="pdp__lower">
          <div className="promo" role="img" aria-label="Personalised sweatshirts" />
          <div className="ptabs">
            <div className="ptabs__bar" role="tablist">
              {TABS.map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'is-on' : ''} onClick={() => setTab(t)}>{t}</button>
              ))}
            </div>
            <div className="ptabs__panel" role="tabpanel">
              {tab === 'Description' && (
                <>
                  <p>{p.description}</p>
                  {p.highlights.length > 0 && <ul>{p.highlights.map((h) => <li key={h}>{h}</li>)}</ul>}
                  {p.composition && <p>Composition: {p.composition}{p.features.length ? ` - ${p.features.join(' - ')}` : ''}</p>}
                  {p.weight && <p>Weight: {p.weight}</p>}
                  {p.eco.length > 0 && <p>Eco responsible: {p.eco.join(', ')}</p>}
                  <p>Reference: {p.id}</p>
                  {p.techFile && <p><a className="link link--strong" href={p.techFile} target="_blank" rel="noreferrer">Technical sheet (PDF) →</a></p>}
                </>
              )}
              {tab === 'Size guide' && (
                <div className="tablewrap">
                  <table className="table">
                    <thead><tr><th>Size</th>{dimCols.map((d) => <th key={d}>{d}</th>)}<th>Pack</th><th>Carton</th><th>Unit price</th></tr></thead>
                    <tbody>
                      {sizeRows.map((s) => (
                        <tr key={s.sku}><td>{s.size}</td>{dimCols.map((d) => <td key={d}>{s.dims[d] || '—'}</td>)}<td>{s.pack || '—'}</td><td>{s.box || '—'}</td><td>{formatPrice(s.price)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  {dimCols.length === 0 && <p className="muted small">The supplier provides no measurements for this item.</p>}
                </div>
              )}
              {tab === 'Printing' && SERVICES.map((s) => <p key={s.title}><strong>{s.title}.</strong> {s.text}</p>)}
              {tab === 'Delivery' && (
                <>
                  <p><strong>{TRUST[2].title}.</strong> {TRUST[2].text}.</p>
                  <p><strong>{TRUST[0].title}.</strong> {TRUST[0].text}.</p>
                </>
              )}
              {tab === 'Decreasing prices' && (
                <>
                  <p>{TRUST[1].text}.</p>
                  {color.sizes[0]?.pack && <p>This item ships in packs of {color.sizes[0].pack}{color.sizes[0].box ? ` and cartons of ${color.sizes[0].box}` : ''}.</p>}
                  <p><button className="link link--strong" onClick={onQuote}>Request a quote for a volume order →</button></p>
                </>
              )}
            </div>
          </div>
        </div>

        <section className="related">
          <h2 className="h2">Related Products</h2>
          <div className="grid-4 grid-4--cards">
            {(data.related || []).map((r) => <ProductCard key={r.id} product={r} />)}
          </div>
        </section>
      </div>

      <Faq />
      <div className="container"><QuoteCta onQuote={onQuote} boxed /></div>

      {kind && studioZone && (
        <DesignStudio kind={kind} colors={color.hex} colorOptions={p.colors} colorIndex={ci} onColor={setCi}
          designs={designs} setDesigns={setDesigns} type={type} onType={setType} initialZone={studioZone}
          onClose={() => setStudioZone(null)} onDone={() => { setStudioZone(null); setSide('Front'); }} doneLabel="Save design" />
      )}

      {customOpen && (
        <div className="overlay overlay--center" onClick={() => setCustomOpen(false)}>
          <div className="modal" role="dialog" aria-label="Customise" onClick={(e) => e.stopPropagation()}>
            <div className="drawer__head">
              <h2 className="h2">Customise — {type}</h2>
              <button className="icon-btn" aria-label="Close" onClick={() => setCustomOpen(false)}><Close /></button>
            </div>
            <div className="form">
              <label className="form__wide">Your logo or artwork
                <input type="file" accept="image/*,.pdf,.svg,.ai,.eps" onChange={(e) => uploadArtwork(e.target.files?.[0])} />
              </label>
              {artwork?.url && <img className="form__wide artwork" src={artwork.url} alt="Artwork preview" />}
              <p className="form__wide muted small">
                {placements.length ? `${placements.length} placement${placements.length === 1 ? '' : 's'} selected.` : 'No placement selected yet — pick one under “Select placement”.'} Your file is sent to our workshop with the order.
              </p>
              {artwork && <button className="link form__wide" onClick={() => setArtwork(null)}>Remove artwork</button>}
              <button className="btn btn--dark form__wide" disabled={artwork?.uploading} onClick={() => setCustomOpen(false)}>Save customisation</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
