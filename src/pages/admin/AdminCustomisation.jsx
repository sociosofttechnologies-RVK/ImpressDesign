import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DesignOverview } from '../../components/DesignStudio.jsx';
import { download, fetchBlob, formatMoney } from '../../lib/api.js';
import { fetchProduct } from '../../lib/products.js';
import { FONTS, GARMENTS, ZONES, fontCss, luminance, placementLabel, printSize } from '../../lib/garments.js';

const GARMENT_NAME = { tshirt: 'T-shirt', cap: 'Cap' };
const fontLabel = (id) => (FONTS.find((f) => f.id === id) || {}).label || id || '—';
const blobToDataUrl = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });

/** Customer artwork / mock-up from the authenticated uploads endpoint, as an <img>. */
function UploadImage({ id, alt, className = '' }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!id) return undefined;
    let live = true, u = '';
    fetchBlob(`/admin/uploads/${id}`)
      .then((b) => { if (!live) return; if (!b.type.startsWith('image/')) { setFailed(true); return; } u = URL.createObjectURL(b); setUrl(u); })
      .catch(() => live && setFailed(true));
    return () => { live = false; if (u) URL.revokeObjectURL(u); };
  }, [id]);
  if (!id || failed) return <span className={`cz-img cz-img--none ${className}`}>{id ? 'No preview' : 'Not uploaded'}</span>;
  if (!url) return <span className={`cz-img cz-img--none ${className}`}>Loading…</span>;
  return <img className={`cz-img ${className}`} src={url} alt={alt} />;
}

/** Re-creates the customer's design in the live preview (3D cap / T-shirt front + back), artwork loaded from the server. */
function LivePreview({ item, design }) {
  const [state, setState] = useState({ status: 'loading' });
  useEffect(() => {
    let live = true;
    (async () => {
      let hex = ['#ffffff'];
      try {
        const d = await fetchProduct(item.slug);
        hex = d?.product?.colors.find((c) => c.name === item.color)?.hex || hex;
      } catch { /* product no longer in the catalogue: show it on white */ }
      const designs = {};
      for (const d of design.items) {
        if (d.kind === 'image') {
          let src = '', aspect = 1;
          try {
            if (d.uploadId) {
              src = await blobToDataUrl(await fetchBlob(`/admin/uploads/${d.uploadId}`));
              aspect = await new Promise((res) => { const i = new Image(); i.onload = () => res((i.naturalWidth || 1) / (i.naturalHeight || 1)); i.onerror = () => res(1); i.src = src; });
            }
          } catch { /* artwork missing: zone stays empty in the preview */ }
          if (src) designs[d.zone] = { ...d, src, aspect };
        } else {
          designs[d.zone] = d;
        }
      }
      if (live) setState({ status: 'ready', hex, designs });
    })();
    return () => { live = false; };
  }, [item.slug, item.color, design]);
  if (state.status !== 'ready') return <p className="muted small">Loading live preview…</p>;
  return <div className={`cz-live ${GARMENTS[design.garment].three ? 'cz-live--3d' : ''}`}><DesignOverview kind={design.garment} colors={state.hex} designs={state.designs} autoRotate={false} /></div>;
}

function TextSwatch({ d, garmentDark }) {
  return (
    <span className={`cz-text ${garmentDark ? 'cz-text--dark' : ''}`} style={{ fontFamily: `${fontCss(d.font)}, sans-serif`, fontWeight: d.bold ? 700 : 400, color: d.color }}>
      {d.text.split('\n').map((l, i) => <span key={i}>{l}</span>)}
    </span>
  );
}

/** One customised product (all its sizes share the same design). */
function DesignCard({ group, currency, onError }) {
  const { items, design, type } = group;
  const first = items[0];
  const [live, setLive] = useState(false);
  const qty = items.reduce((n, i) => n + i.qty, 0);
  const marking = items.reduce((n, i) => n + (i.markingTotal || 0), 0);
  const save = (id, name) => download(`/admin/uploads/${id}`, name).catch((e) => onError(e.message));
  const garment = design?.garment;

  return (
    <article className="cz-card">
      <header className="cz-card__head">
        <div>
          <h3 className="cz-card__title">{first.brand} {first.name}</h3>
          <p className="muted small">
            {first.color} · {GARMENT_NAME[garment] || 'Garment'} · ref {first.ref} · <Link className="link" to={`/clothing/${first.slug}`} target="_blank">product page</Link>
          </p>
        </div>
        <div className="cz-card__meta">
          <span className="pill">{type}</span>
          <span className={`pill pill--${first.customisationStatus === 'done' ? 'delivered' : 'placed'}`}>Marking: {first.customisationStatus === 'done' ? 'done' : 'to do'}</span>
        </div>
      </header>

      <dl className="cz-facts">
        <dt>Quantity</dt><dd><strong>{qty}</strong> — {items.map((i) => `${i.size} × ${i.qty}`).join(', ')}</dd>
        <dt>Marking</dt><dd>{formatMoney(marking, currency)} · {design?.items.length || first.customisation.placements.length} location{(design?.items.length || first.customisation.placements.length) === 1 ? '' : 's'}</dd>
        <dt>Supplier</dt><dd>{[...new Set(items.map((i) => i.vendorStatus))].join(', ')}{first.vendorReference ? ` · ${first.vendorReference}` : ''}</dd>
      </dl>

      {design ? (
        <>
          <div className="cz-visuals">
            <figure className="cz-mock">
              {design.mockupUploadId ? <UploadImage id={design.mockupUploadId} alt="Customer mock-up" /> : <span className="cz-img cz-img--none">No mock-up saved</span>}
              <figcaption className="muted small">
                Mock-up approved by the customer
                {design.mockupUploadId && <> · <button className="link" onClick={() => save(design.mockupUploadId, `mockup-${first.ref}-${first.color}.jpg`)}>Download</button></>}
              </figcaption>
            </figure>
            <div className="cz-live-wrap no-print">
              {live ? <LivePreview item={first} design={design} /> : (
                <button className="btn btn--outline btn--sm" onClick={() => setLive(true)}>{GARMENTS[garment]?.three ? 'Open 3D preview' : 'Open live preview'}</button>
              )}
            </div>
          </div>

          <div className="tablewrap">
            <table className="table table--light cz-table">
              <thead><tr><th>Print location</th><th>Artwork</th><th>Details</th><th className="no-print">File</th></tr></thead>
              <tbody>
                {design.items.map((d) => {
                  const zone = ZONES[d.zone];
                  const [w, h] = zone ? printSize(d, zone) : [null, null];
                  return (
                    <tr key={d.zone}>
                      <td><strong>{zone?.label || placementLabel(d.zone)}</strong>{zone && <><br /><span className="muted small">{zone.side}{zone.hint ? ` · ${zone.hint}` : ''}</span></>}</td>
                      <td className="cz-art">
                        {d.kind === 'image' ? <UploadImage id={d.uploadId} alt={d.name} className="cz-img--art" /> : <TextSwatch d={d} garmentDark={luminance(d.color) > 0.7} />}
                      </td>
                      <td className="small">
                        {d.kind === 'image'
                          ? <>Image <strong>{d.name}</strong></>
                          : <>Text “{d.text.replace(/\n/g, ' / ')}”<br />{fontLabel(d.font)}{d.bold ? ', bold' : ''} · <span className="design-spec__ink" style={{ background: d.color }} /> {d.color}</>}
                        <br />
                        {w != null && <>Print size ≈ <strong>{w} × {h} cm</strong> · </>}
                        scale {Math.round(d.scale * 100)}%
                        {d.rotate ? ` · rotated ${d.rotate}°` : ''}
                        {d.x || d.y ? ` · offset ${Math.round(d.x * 100)}% / ${Math.round(d.y * 100)}%` : ' · centred'}
                      </td>
                      <td className="no-print">
                        {d.kind === 'image'
                          ? (d.uploadId ? <button className="btn btn--outline btn--sm" onClick={() => save(d.uploadId, d.name)}>Download</button> : <span className="form-error small">File missing</span>)
                          : <button className="btn btn--outline btn--sm" onClick={() => navigator.clipboard?.writeText(d.text)}>Copy text</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="small">
          <p>Placements: {first.customisation.placements.map(placementLabel).join(', ') || '—'}</p>
          {first.customisation.artworkId
            ? <p>Artwork: <button className="link link--strong" onClick={() => save(first.customisation.artworkId, first.customisation.artwork)}>{first.customisation.artwork}</button></p>
            : <p className="muted">No artwork file attached.</p>}
        </div>
      )}
    </article>
  );
}

/**
 * Admin order page: everything the workshop needs per customised product — mock-up, live preview, and for each
 * print location the artwork (or text, font, colour), print size, position and original file.
 */
export default function CustomisationPanel({ order, onError }) {
  const groups = useMemo(() => {
    const m = new Map();
    for (const i of order.items.filter((x) => x.customisation)) {
      const k = JSON.stringify([i.ref, i.color, i.customisation.type, i.customisation.design?.items || i.customisation.placements, i.customisation.artworkId]);
      if (!m.has(k)) m.set(k, { items: [], design: i.customisation.design, type: i.customisation.type });
      m.get(k).items.push(i);
    }
    return [...m.values()];
  }, [order.items]);

  useEffect(() => {
    if (window.location.hash === '#customisation') document.getElementById('customisation')?.scrollIntoView({ block: 'start' });
  }, []);

  if (!groups.length) return null;
  const printSheet = () => {
    document.body.classList.add('print-production');
    const done = () => { document.body.classList.remove('print-production'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 50);
  };

  return (
    <section className="panel prod-sheet" id="customisation">
      <div className="panel__head">
        <h2 className="h3">Customisation details</h2>
        <button className="btn btn--dark btn--sm no-print" onClick={printSheet}>Print production sheet</button>
      </div>
      <p className="print-only small">
        Order <strong>{order.orderNumber}</strong> · {order.contact.name}{order.contact.company ? `, ${order.contact.company}` : ''} · {order.contact.phone}
      </p>
      <div className="stack-lg">
        {groups.map((g, i) => <DesignCard key={i} group={g} currency={order.totals.currency} onError={onError} />)}
      </div>
    </section>
  );
}
