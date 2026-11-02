import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import RequireAuth from '../../components/RequireAuth.jsx';
import { api, formatDate } from '../../lib/api.js';
import AdminOrders from './AdminOrders.jsx';
import AdminUsers from './AdminUsers.jsx';

const TABS = [['orders', 'Orders'], ['supplier', 'Supplier orders'], ['users', 'Users'], ['feedback', 'Feedback'], ['catalog', 'Catalog']];

function Supplier() {
  const [pending, setPending] = useState(null);
  const [vos, setVos] = useState([]);
  const [sel, setSel] = useState([]);
  const [express, setExpress] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api('/admin/vendor/pending').then((p) => { setPending(p); setSel((s) => s.filter((id) => p.items.some((i) => i.id === id))); }).catch((e) => setError(e.message));
    api('/admin/vendor/orders').then(setVos).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const items = pending?.items || [];
  const groupable = items.filter((i) => i.fulfilmentType === 'customised');
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const selectedUnits = items.filter((i) => sel.includes(i.id)).reduce((n, i) => n + i.qty, 0);

  const place = async (ids) => {
    setBusy(true); setError(''); setMsg('');
    try {
      const vo = await api('/admin/vendor/orders', { method: 'POST', body: { itemIds: ids, express } });
      setMsg(`Supplier order ${vo.reference} placed${vo.dryRun ? ' (dry run — TopTex credentials not set)' : ` · TopTex #${vo.toptexOrderId}`} for ${vo.units} units.`);
      setSel([]);
    } catch (e) { setError(e.message); }
    setBusy(false);
    load();
  };
  const received = async (id) => {
    setError('');
    try { await api(`/admin/vendor/orders/${id}/received`, { method: 'POST' }); load(); } catch (e) { setError(e.message); }
  };

  return (
    <>
      <section className="panel">
        <h2 className="h3">Waiting to be ordered</h2>
        <p className="muted small">Tip: you can also group garments by customer order — tick orders under <Link className="link" to="/admin?tab=orders&supplier=to_order&type=customised">Orders</Link> and choose “Order garments”.</p>
        <p className="muted small">
          Mode: <strong>{pending?.mode}</strong> — {pending?.mode === 'grouped' ? 'customised items wait here; select items from several orders to send one TopTex order (quantities are summed per SKU).' : 'orders are sent to TopTex when the customer checks out; anything here failed and can be resent.'}
          {pending?.dryRun && <> · <strong>Dry run</strong>: TopTex credentials are not configured, orders are only recorded.</>}
        </p>
        {msg && <p className="banner-ok">{msg}</p>}
        {error && <p className="form-error">{error}</p>}
        {!pending ? <p className="muted">Loading…</p> : items.length === 0 ? <p className="muted">Nothing waiting.</p> : (
          <>
            {pending.bySku.length > 0 && (
              <div className="tablewrap">
                <table className="table table--light">
                  <thead><tr><th>SKU</th><th>Product</th><th>Colour / size</th><th>Total qty</th><th>Orders</th></tr></thead>
                  <tbody>{pending.bySku.map((s) => <tr key={s.sku}><td>{s.sku}</td><td>{s.name}</td><td>{s.color} · {s.size}</td><td><strong>{s.qty}</strong></td><td className="small">{s.orders.join(', ')}</td></tr>)}</tbody>
                </table>
              </div>
            )}
            <div className="tablewrap">
              <table className="table table--light">
                <thead><tr><th><input type="checkbox" aria-label="Select all customised items" checked={groupable.length > 0 && groupable.every((i) => sel.includes(i.id))} onChange={(e) => setSel(e.target.checked ? groupable.map((i) => i.id) : [])} /></th><th>Order</th><th>Item</th><th>Qty</th><th>Type</th></tr></thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id}>
                      <td>{i.fulfilmentType === 'customised'
                        ? <input type="checkbox" checked={sel.includes(i.id)} onChange={() => toggle(i.id)} aria-label={`Select ${i.sku}`} />
                        : <button className="link link--strong" disabled={busy} onClick={() => place(items.filter((x) => x.orderNumber === i.orderNumber).map((x) => x.id))}>Resend</button>}</td>
                      <td><Link className="link" to={`/admin/orders/${i.orderNumber}`}>{i.orderNumber}</Link></td>
                      <td>{i.brand} {i.name} · {i.color} · {i.size} <span className="muted small">{i.sku}</span></td>
                      <td>{i.qty}</td>
                      <td>{i.fulfilmentType === 'direct' ? 'Direct to customer' : i.customisation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="toolbar">
              <label className="check"><input type="checkbox" checked={express} onChange={(e) => setExpress(e.target.checked)} /><span>Express supplier shipping</span></label>
              <button className="btn btn--primary" disabled={!sel.length || busy} onClick={() => place(sel)}>
                {busy ? 'Sending…' : `Place TopTex order (${sel.length} item${sel.length === 1 ? '' : 's'}, ${selectedUnits} units)`}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="panel">
        <h2 className="h3">Supplier orders</h2>
        {vos.length === 0 ? <p className="muted">None yet.</p> : (
          <div className="tablewrap">
            <table className="table table--light">
              <thead><tr><th>Reference</th><th>TopTex #</th><th>Placed</th><th>Mode</th><th>Deliver to</th><th>Units</th><th>Customer orders</th><th>Status</th><th /></tr></thead>
              <tbody>
                {vos.map((v) => (
                  <tr key={v.id}>
                    <td><Link className="link link--strong" to={`/admin?tab=orders&po=${v.reference}`}>{v.reference}</Link></td>
                    <td>{v.toptexOrderId || '—'}{v.dryRun && <span className="muted small"> (dry run)</span>}</td>
                    <td>{formatDate(v.placedAt, true)}</td>
                    <td>{v.mode}</td>
                    <td>{v.deliverTo === 'customer' ? 'Customer (direct)' : 'Workshop'}</td>
                    <td>{v.units}</td>
                    <td className="small wrap">{v.orders.map((o) => <Link key={o} className="link" to={`/admin/orders/${o}`}>{o} </Link>)}</td>
                    <td>{v.status}{v.error && <span className="form-error small"> {v.error}</span>}</td>
                    <td>{v.status === 'placed' && v.deliverTo === 'workshop' && <button className="btn btn--outline btn--sm" onClick={() => received(v.id)}>Mark received</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function Feedback() {
  const [fb, setFb] = useState(null);
  useEffect(() => { api('/admin/feedback').then(setFb).catch(() => setFb({ items: [], count: 0 })); }, []);
  if (!fb) return <p className="muted">Loading…</p>;
  return (
    <section className="panel">
      <h2 className="h3">Customer feedback {fb.count ? `· ${fb.average} / 5 from ${fb.count}` : ''}</h2>
      {fb.items.length === 0 ? <p className="muted">No feedback yet.</p> : (
        <ul className="fb-list">
          {fb.items.map((f) => (
            <li key={f.orderNumber}>
              <span className="stars stars--static" aria-label={`${f.rating} of 5`}>{'★'.repeat(f.rating)}<span className="muted">{'★'.repeat(5 - f.rating)}</span></span>
              <p>{f.comment || <span className="muted">No comment</span>}</p>
              <p className="muted small">{f.customer} · <Link className="link" to={`/admin/orders/${f.orderNumber}`}>{f.orderNumber}</Link> · {formatDate(f.at)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Catalog() {
  const [st, setSt] = useState(null);
  const [msg, setMsg] = useState('');
  const load = useCallback(() => api('/admin/catalog').then(setSt).catch((e) => setMsg(e.message)), []);
  useEffect(() => { load(); }, [load]);
  // Poll while a download is running.
  useEffect(() => {
    if (!st?.running) return undefined;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [st?.running, load]);
  const sync = async () => {
    setMsg('');
    try { setSt(await api('/admin/catalog/sync', { method: 'POST' })); } catch (e) { setMsg(e.message); }
  };
  if (!st) return <p className="muted">{msg || 'Loading…'}</p>;
  const c = st.catalog;
  const pct = st.total ? Math.min(100, Math.round((st.fetched / st.total) * 100)) : null;
  return (
    <section className="panel">
      <h2 className="h3">Product catalog</h2>
      <p>
        <strong>{c.products}</strong> products in the shop · source: <strong>{c.source === 'toptex-sync' ? 'TopTex API' : 'bundled sample (50 products)'}</strong>
        {c.generatedAt && !st.running ? ` · last download ${formatDate(c.generatedAt, true)}` : ''}
      </p>
      {st.running && (
        <div className="stack">
          <p>Downloading from TopTex — page {st.page}, {st.fetched}{st.total ? ` of ${st.total}` : ''} products…</p>
          {pct != null && <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${pct}%` }} /></div>}
        </div>
      )}
      {st.lastError && !st.running && <p className="form-error">Last download failed: {st.lastError}</p>}
      <p className="muted small">The API downloads the full TopTex catalog page by page (GET /v3/products/all) when it starts and every 24 hours. The shop then pages through it on the server, so the listing stays fast. Checkout prices come from this copy.</p>
      <div><button className="btn btn--dark" disabled={st.running || !st.configured} onClick={sync}>{st.running ? 'Downloading…' : 'Download from TopTex now'}</button></div>
      {!st.configured && <p className="form-error small">TopTex credentials are not set. Add TOPTEX_API_KEY, TOPTEX_USERNAME and TOPTEX_PASSWORD to server/.env and restart.</p>}
      {msg && <p className="form-error small">{msg}</p>}
    </section>
  );
}

function AdminInner() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'orders';
  return (
    <div className="page">
      <div className="container">
        <h1 className="h1 page-title">Admin</h1>
        <div className="tabs admin-tabs" role="tablist">
          {TABS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'is-active' : ''} onClick={() => setParams({ tab: k })}>{label}</button>
          ))}
        </div>
        <div className="stack-lg">
          {tab === 'orders' && <AdminOrders />}
          {tab === 'users' && <AdminUsers />}
          {tab === 'supplier' && <Supplier />}
          {tab === 'feedback' && <Feedback />}
          {tab === 'catalog' && <Catalog />}
        </div>
      </div>
    </div>
  );
}

export default function Admin() {
  return <RequireAuth admin><AdminInner /></RequireAuth>;
}
