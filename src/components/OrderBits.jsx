import { formatDate, formatMoney } from '../lib/api.js';
import { placementLabel, fontCss, FONTS } from '../lib/garments.js';

export const STATUS_LABEL = {
  placed: 'Order placed',
  materials_ordered: 'Garments ordered',
  materials_received: 'Garments at workshop',
  in_customisation: 'Customisation',
  ready_to_ship: 'Ready to ship',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const StatusPill = ({ status, label }) => <span className={`pill pill--${status}`}>{label || STATUS_LABEL[status] || status}</span>;

const PAYMENT_LABEL = { unpaid: 'Unpaid', paid: 'Paid', refunded: 'Refunded' };
export const PaymentPill = ({ status }) => <span className={`pill pill--pay-${status}`}>{PAYMENT_LABEL[status] || status}</span>;

/** Step-by-step progress for the order's own flow (direct orders skip the workshop steps). */
export function Timeline({ flow, status, history }) {
  const at = Object.fromEntries((history || []).map((h) => [h.status, h.at]));
  // The final step (delivered) counts as done, not in progress.
  const current = status === flow[flow.length - 1] ? flow.length : flow.indexOf(status);
  if (status === 'cancelled') return <p className="form-error">This order was cancelled{at.cancelled ? ` on ${formatDate(at.cancelled)}` : ''}.</p>;
  return (
    <ol className="timeline">
      {flow.map((s, i) => (
        <li key={s} className={i < current ? 'is-done' : i === current ? 'is-current' : ''}>
          <span className="timeline__dot" aria-hidden="true" />
          <strong>{STATUS_LABEL[s]}</strong>
          {at[s] && <span className="muted small">{formatDate(at[s], true)}</span>}
        </li>
      ))}
    </ol>
  );
}

const PLACEMENT = placementLabel;
const fontLabel = (id) => (FONTS.find((f) => f.id === id) || {}).label || id;

/** Design-studio details for one order line: what is printed where, with download links for the admin. */
function DesignSpec({ design, admin, onUpload }) {
  if (!design?.items?.length) return null;
  const file = (id, name) => (admin && onUpload && id ? <button className="link" onClick={() => onUpload(id, name)}>{name}</button> : name);
  return (
    <ul className="small design-spec">
      {design.items.map((d) => (
        <li key={d.zone}>
          <strong>{PLACEMENT(d.zone)}</strong>:{' '}
          {d.kind === 'image'
            ? <>image {file(d.uploadId, d.name)}{!d.uploadId && admin ? ' (file missing)' : ''}</>
            : <>text “<span style={{ fontFamily: fontCss(d.font) }}>{d.text}</span>” · {fontLabel(d.font)}{d.bold ? ' bold' : ''} · <span className="design-spec__ink" style={{ background: d.color }} /> {d.color}</>}
          {admin && <span className="muted"> · size {Math.round(d.scale * 100)}%{d.rotate ? ` · ${d.rotate}°` : ''}{d.x || d.y ? ` · offset ${Math.round(d.x * 100)}%, ${Math.round(d.y * 100)}%` : ''}</span>}
        </li>
      ))}
      {design.mockupUploadId && <li>{admin && onUpload ? <button className="link link--strong" onClick={() => onUpload(design.mockupUploadId, 'mockup.jpg')}>Download mock-up</button> : null}</li>}
    </ul>
  );
}

export function ItemsTable({ items, currency, admin = false, onArtwork, onUpload }) {
  return (
    <div className="tablewrap">
      <table className="table table--light">
        <thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Garments</th><th>Marking</th>{admin && <th>Supplier</th>}</tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td className="wrap">
                <strong>{i.brand} {i.name}</strong><br />
                <span className="muted small">{i.color} · {i.size} · {i.sku}</span>
                {i.customisation && (
                  <><br /><span className="small">{i.customisation.type}: {i.customisation.placements.map(PLACEMENT).join(', ')}
                    {i.customisation.artwork && (admin && onArtwork
                      ? <> · <button className="link" onClick={() => onArtwork(i.customisation)}>{i.customisation.artwork}</button></>
                      : ` · ${i.customisation.artwork}`)}</span>
                    <DesignSpec design={i.customisation.design} admin={admin} onUpload={onUpload} /></>
                )}
              </td>
              <td>{i.qty}</td>
              <td>{formatMoney(i.unitPrice, currency)}</td>
              <td>{formatMoney(i.goodsTotal, currency)}</td>
              <td>{i.markingTotal ? formatMoney(i.markingTotal, currency) : '—'}</td>
              {admin && <td className="small">{i.vendorStatus}{i.vendorReference ? <><br />{i.vendorReference}</> : ''}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Totals({ t }) {
  return (
    <dl className="totals">
      <dt>Garments</dt><dd>{formatMoney(t.goods, t.currency)}</dd>
      <dt>Customisation</dt><dd>{formatMoney(t.marking, t.currency)}</dd>
      <dt>Delivery</dt><dd>{formatMoney(t.shipping, t.currency)}</dd>
      <dt>VAT ({Math.round(t.taxRate * 100)}%)</dt><dd>{formatMoney(t.tax, t.currency)}</dd>
      <dt className="totals__grand">Total</dt><dd className="totals__grand">{formatMoney(t.grand, t.currency)}</dd>
    </dl>
  );
}

export function Shipments({ shipments }) {
  if (!shipments.length) return null;
  return shipments.map((s) => (
    <div key={s.id} className="shipment">
      <p>
        <strong>{s.carrier}</strong>{s.service ? ` · ${s.service}` : ''} · tracking{' '}
        {s.trackingUrl ? <a className="link link--strong" href={s.trackingUrl} target="_blank" rel="noreferrer">{s.trackingNumber}</a> : <strong>{s.trackingNumber}</strong>}
        {s.source === 'toptex' && <span className="muted small"> · shipped directly by our supplier</span>}
      </p>
      <ul className="events">
        {s.events.map((e, i) => (
          <li key={i}><span className="muted small">{formatDate(e.at, true)}</span> {e.description}{e.location ? ` — ${e.location}` : ''}</li>
        ))}
      </ul>
    </div>
  ));
}

export const COUNTRIES = [
  ['FR', 'France'], ['BE', 'Belgium'], ['LU', 'Luxembourg'], ['DE', 'Germany'], ['ES', 'Spain'], ['IT', 'Italy'], ['NL', 'Netherlands'],
  ['PT', 'Portugal'], ['AT', 'Austria'], ['IE', 'Ireland'], ['CH', 'Switzerland'], ['GB', 'United Kingdom'], ['US', 'United States'], ['IN', 'India'],
];
