import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminModal from './AdminModal.jsx';
import { api } from '../../lib/api.js';

/**
 * Groups the garments of the selected customer orders into one TopTex purchase order.
 * Shows the per-SKU quantities and which orders are left out (and why) before anything is sent.
 */
export default function GroupOrderModal({ orderNumbers, onClose, onPlaced }) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [express, setExpress] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    api('/admin/vendor/group-preview', { method: 'POST', body: { orderNumbers } }).then(setPreview).catch((e) => setError(e.message));
  }, [orderNumbers]);

  const place = async () => {
    setBusy(true); setError('');
    try {
      const vo = await api('/admin/vendor/group-orders', { method: 'POST', body: { orderNumbers, express } });
      setDone(vo);
      onPlaced?.(vo);
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  return (
    <AdminModal title="Order garments from TopTex" onClose={onClose} wide>
      {error && <p className="form-error">{error}</p>}
      {done ? (
        <div className="stack">
          <p className="banner-ok banner-ok--flush">
            Supplier order <strong>{done.reference}</strong> placed for <strong>{done.units} units</strong> covering {done.orders.length} customer order{done.orders.length === 1 ? '' : 's'}.
            {done.dryRun ? ' Dry run — TopTex credentials are not set, so it was only recorded here.' : ` TopTex order #${done.toptexOrderId}.`}
          </p>
          <p className="muted small">The orders moved to “Garments ordered”. Mark the delivery received under Supplier orders when it reaches the workshop.</p>
          <div className="actions">
            <Link className="btn btn--dark" to={`/admin?tab=orders&po=${done.reference}`} onClick={onClose}>Show these orders</Link>
            <Link className="btn btn--outline" to="/admin?tab=supplier" onClick={onClose}>Supplier orders</Link>
            <button className="btn btn--outline" onClick={onClose}>Close</button>
          </div>
        </div>
      ) : !preview ? (
        !error && <p className="muted">Working out quantities…</p>
      ) : (
        <div className="stack-lg">
          <div className="kpis">
            <div><strong>{preview.totals.orders}</strong><span>orders included</span></div>
            <div><strong>{preview.totals.skus}</strong><span>SKUs</span></div>
            <div><strong>{preview.totals.units}</strong><span>units to order</span></div>
          </div>

          {preview.lines.length > 0 && (
            <div className="tablewrap">
              <table className="table table--light table--compact">
                <thead><tr><th>SKU</th><th>Product</th><th>Colour · size</th><th className="num">Qty</th><th>From orders</th></tr></thead>
                <tbody>
                  {preview.lines.map((l) => (
                    <tr key={l.sku}>
                      <td className="mono">{l.sku}</td>
                      <td className="wrap">{l.name}</td>
                      <td>{l.color} · {l.size}</td>
                      <td className="num"><strong>{l.qty}</strong></td>
                      <td className="small wrap">{l.orders.map((o) => `${o.orderNumber} ×${o.qty}`).join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {preview.skipped.length > 0 && (
            <div className="note">
              <strong>Left out ({preview.skipped.length})</strong>
              <ul className="plain-list">
                {preview.skipped.map((s) => <li key={s.orderNumber}><span className="mono">{s.orderNumber}</span> — {s.reason}</li>)}
              </ul>
            </div>
          )}

          {preview.dryRun && <p className="muted small"><strong>Dry run:</strong> TopTex credentials are not configured — the order will be recorded here but not sent.</p>}

          <div className="toolbar toolbar--end">
            <label className="check"><input type="checkbox" checked={express} onChange={(e) => setExpress(e.target.checked)} /><span>Express supplier shipping</span></label>
            <button className="btn btn--outline" onClick={onClose}>Cancel</button>
            <button className="btn btn--primary" disabled={busy || !preview.itemIds.length} onClick={place}>
              {busy ? 'Sending…' : `Place TopTex order · ${preview.totals.units} units`}
            </button>
          </div>
        </div>
      )}
    </AdminModal>
  );
}
