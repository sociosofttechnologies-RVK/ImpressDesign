import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { STATUS_LABEL, StatusPill, PaymentPill } from '../../components/OrderBits.jsx';
import { api, formatDate, formatMoney } from '../../lib/api.js';
import GroupOrderModal from './GroupOrderModal.jsx';
import { placementLabel } from '../../lib/garments.js';

// Filters live in the URL, so a filtered view can be bookmarked or linked (e.g. from Users → "Orders").
const FILTER_KEYS = ['q', 'status', 'payment', 'type', 'supplier', 'country', 'from', 'to', 'sort', 'user', 'po', 'page'];
const SUPPLIER = [['to_order', 'Garments to order'], ['ordered', 'Ordered — awaiting delivery'], ['received', 'All garments received']];
const PAGE_SIZE = 50;

function SupplierCell({ s, type }) {
  if (!s.total) return <span className="muted">—</span>;
  if (s.pending) return <span className="flag flag--warn">{s.pending} item{s.pending === 1 ? '' : 's'} to order</span>;
  if (s.ordered) return <span className="flag">Ordered</span>;
  return <span className="flag flag--ok">{type === 'direct' ? 'Sent' : 'Received'}</span>;
}

function toCsv(rows) {
  const head = ['Order', 'Date', 'Customer', 'Email', 'Company', 'Destination', 'Type', 'Units', 'Supplier', 'Payment', 'Status', 'Total', 'Currency'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((o) => [o.orderNumber, o.createdAt, o.customer, o.email, o.company, o.destination, o.fulfilmentType, o.units,
    o.supplier.pending ? `${o.supplier.pending} to order` : o.supplier.ordered ? 'ordered' : 'received', o.paymentStatus, o.statusLabel, o.total, o.currency].map(esc).join(','));
  return [head.map(esc).join(','), ...lines].join('\r\n');
}
function downloadCsv(rows) {
  const url = URL.createObjectURL(new Blob([`﻿${toCsv(rows)}`], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `orders-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const GARMENT_NAME = { tshirt: 'T-shirt', cap: 'Cap' };
/** Orders list: technique + number of print locations, linking to the order's customisation details. */
function CustomCell({ c, to }) {
  if (!c) return <span className="muted">—</span>;
  const g = c.garments.map((k) => GARMENT_NAME[k] || k).join(', ');
  return (
    <Link className="link" to={to} title={c.locations.map(placementLabel).join('\n')}>
      {c.types.join(' + ')} · {c.locations.length} location{c.locations.length === 1 ? '' : 's'}
      {g && <><br /><span className="muted">{g}{c.designs > 1 ? ` · ${c.designs} designs` : ''}</span></>}
    </Link>
  );
}

export default function AdminOrders() {
  const [params, setParams] = useSearchParams();
  const f = useMemo(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || ''])), [params]);
  const [q, setQ] = useState(f.q);
  const [data, setData] = useState(null);
  const [countries, setCountries] = useState([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [sel, setSel] = useState(() => new Map()); // orderNumber -> row (kept across pages and filters)
  const [grouping, setGrouping] = useState(null);
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkPay, setBulkPay] = useState('');
  const [busy, setBusy] = useState(false);

  const setFilter = useCallback((patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    if (!('page' in patch)) next.delete('page');
    next.set('tab', 'orders');
    setParams(next, { replace: true });
  }, [params, setParams]);

  // Search box → URL after a short pause.
  useEffect(() => { setQ(f.q); }, [f.q]);
  useEffect(() => {
    if (q === f.q) return undefined;
    const t = setTimeout(() => setFilter({ q }), 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(() => {
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
    qs.set('pageSize', PAGE_SIZE);
    setError('');
    return api(`/admin/orders?${qs}`).then(setData).catch((e) => setError(e.message));
  }, [f]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api('/admin/orders-countries').then(setCountries).catch(() => {}); }, []);

  const rows = data?.items || [];
  const counts = data?.statusCounts || {};
  const allCount = Object.values(counts).reduce((n, c) => n + c, 0);
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const page = Number(f.page) || 1;
  const active = FILTER_KEYS.filter((k) => !['sort', 'page', 'status'].includes(k) && f[k]);

  const toggle = (o) => setSel((m) => { const n = new Map(m); n.has(o.orderNumber) ? n.delete(o.orderNumber) : n.set(o.orderNumber, o); return n; });
  const pageAllOn = rows.length > 0 && rows.every((o) => sel.has(o.orderNumber));
  const togglePage = () => setSel((m) => {
    const n = new Map(m);
    rows.forEach((o) => (pageAllOn ? n.delete(o.orderNumber) : n.set(o.orderNumber, o)));
    return n;
  });
  const selected = [...sel.values()];
  const selNumbers = [...sel.keys()];
  const selToOrder = selected.filter((o) => o.supplier.pending && o.fulfilmentType === 'customised' && o.status !== 'cancelled');

  const runBulk = async (path, body, label) => {
    setBusy(true); setError(''); setMsg('');
    try {
      const r = await api(path, { method: 'POST', body: { orderNumbers: selNumbers, ...body } });
      const failed = r.failed || [];
      setMsg(`${label}: ${r.updated?.length ?? r.updated} updated${failed.length ? ` · ${failed.length} skipped (${failed.map((x) => `${x.orderNumber}: ${x.error}`).join('; ')})` : ''}.`);
      setSel(new Map());
      await load();
    } catch (e) { setError(e.message); }
    setBusy(false);
  };
  const applyStatus = () => {
    if (!bulkStatus) return;
    if (!window.confirm(`Set ${selNumbers.length} order(s) to “${STATUS_LABEL[bulkStatus]}”?\n\nThis only changes the status — it does not order garments or create shipments.`)) return;
    runBulk('/admin/orders/bulk/status', { status: bulkStatus }, `Status → ${STATUS_LABEL[bulkStatus]}`).then(() => setBulkStatus(''));
  };
  const applyPayment = () => {
    if (!bulkPay) return;
    runBulk('/admin/orders/bulk/payment', { status: bulkPay }, `Payment → ${bulkPay}`).then(() => setBulkPay(''));
  };

  return (
    <section className="panel">
      <div className="chips" role="tablist" aria-label="Filter by status">
        <button className={`chip ${!f.status ? 'is-on' : ''}`} onClick={() => setFilter({ status: '' })}>All <span>{allCount}</span></button>
        {Object.entries(STATUS_LABEL).map(([k, v]) => (
          <button key={k} className={`chip ${f.status === k ? 'is-on' : ''}`} onClick={() => setFilter({ status: k })} disabled={!counts[k] && f.status !== k}>
            {v} <span>{counts[k] || 0}</span>
          </button>
        ))}
      </div>

      <div className="admin-filters">
        <input type="search" className="admin-filters__search" placeholder="Order no., customer, email, phone, company, city" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search orders" />
        <select value={f.supplier} onChange={(e) => setFilter({ supplier: e.target.value })} aria-label="Garments">
          <option value="">Garments: any</option>
          {SUPPLIER.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={f.type} onChange={(e) => setFilter({ type: e.target.value })} aria-label="Order type">
          <option value="">Type: any</option><option value="customised">Customised</option><option value="direct">Direct</option>
        </select>
        <select value={f.payment} onChange={(e) => setFilter({ payment: e.target.value })} aria-label="Payment">
          <option value="">Payment: any</option><option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="refunded">Refunded</option>
        </select>
        <select value={f.country} onChange={(e) => setFilter({ country: e.target.value })} aria-label="Country">
          <option value="">Country: any</option>
          {countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="admin-filters__range">
          <input type="date" value={f.from} max={f.to || undefined} onChange={(e) => setFilter({ from: e.target.value })} aria-label="Placed from" title="Placed from" />
          <span className="muted small">to</span>
          <input type="date" value={f.to} min={f.from || undefined} onChange={(e) => setFilter({ to: e.target.value })} aria-label="Placed to" title="Placed to" />
        </span>
        <select value={f.sort} onChange={(e) => setFilter({ sort: e.target.value })} aria-label="Sort">
          <option value="">Newest first</option><option value="oldest">Oldest first</option><option value="total_desc">Highest total</option><option value="total_asc">Lowest total</option>
        </select>
      </div>

      <div className="toolbar toolbar--between">
        <div className="toolbar">
          <button className="btn btn--outline btn--sm" onClick={() => setFilter({ supplier: 'to_order', type: 'customised', status: '' })}>Garments to order</button>
          {(f.user || f.po) && (
            <span className="flag">{f.user ? `Customer #${f.user}` : `Supplier order ${f.po}`}
              <button className="flag__x" aria-label="Remove filter" onClick={() => setFilter({ user: '', po: '' })}>×</button></span>
          )}
          {(active.length > 0 || f.status) && <button className="link link--strong" onClick={() => { setQ(''); setParams({ tab: 'orders' }, { replace: true }); }}>Clear filters</button>}
        </div>
        <p className="muted small">
          {data ? <><strong>{data.total}</strong> order{data.total === 1 ? '' : 's'} · {formatMoney(data.value)}</> : ''}
          {' · '}<button className="link" disabled={!rows.length} onClick={() => downloadCsv(selected.length ? selected : rows)}>Export {selected.length ? 'selected' : 'page'} (CSV)</button>
        </p>
      </div>

      {msg && <p className="banner-ok banner-ok--flush">{msg}</p>}
      {error && <p className="form-error">{error}</p>}

      {selected.length > 0 && (
        <div className="bulkbar" role="region" aria-label="Bulk actions">
          <strong>{selected.length} selected</strong>
          <button className="btn btn--primary btn--sm" disabled={!selToOrder.length || busy} onClick={() => setGrouping(selNumbers)}
            title={selToOrder.length ? '' : 'None of the selected orders has customised garments waiting to be ordered'}>
            Order garments ({selToOrder.length} order{selToOrder.length === 1 ? '' : 's'})
          </button>
          <span className="bulkbar__group">
            <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} aria-label="New status">
              <option value="">Set status…</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button className="btn btn--dark btn--sm" disabled={!bulkStatus || busy} onClick={applyStatus}>Apply</button>
          </span>
          <span className="bulkbar__group">
            <select value={bulkPay} onChange={(e) => setBulkPay(e.target.value)} aria-label="Payment status">
              <option value="">Set payment…</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option><option value="refunded">Refunded</option>
            </select>
            <button className="btn btn--dark btn--sm" disabled={!bulkPay || busy} onClick={applyPayment}>Apply</button>
          </span>
          <button className="link link--strong" onClick={() => setSel(new Map())}>Clear selection</button>
        </div>
      )}

      {!data ? <p className="muted">{error ? '' : 'Loading…'}</p> : rows.length === 0 ? <p className="muted">No orders match these filters.</p> : (
        <div className="tablewrap">
          <table className="table table--light table--admin">
            <thead>
              <tr>
                <th><input type="checkbox" aria-label="Select all on this page" checked={pageAllOn} onChange={togglePage} /></th>
                <th>Order</th><th>Date</th><th>Customer</th><th>Destination</th><th>Customisation</th><th>Garments</th><th>Payment</th><th>Status</th><th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.orderNumber} className={sel.has(o.orderNumber) ? 'is-selected' : ''}>
                  <td><input type="checkbox" checked={sel.has(o.orderNumber)} onChange={() => toggle(o)} aria-label={`Select ${o.orderNumber}`} /></td>
                  <td>
                    <Link className="link link--strong" to={`/admin/orders/${o.orderNumber}`}>{o.orderNumber}</Link>
                    {o.hasAdminNotes && <span className="dot-note" title="Has internal notes" aria-label="Has internal notes" />}
                    <br /><span className="muted small">{o.fulfilmentType === 'direct' ? 'Direct' : 'Customised'} · {o.units} unit{o.units === 1 ? '' : 's'}</span>
                  </td>
                  <td title={formatDate(o.createdAt, true)}>{formatDate(o.createdAt)}</td>
                  <td className="wrap"><button className="link link--strong" onClick={() => setFilter({ user: String(o.userId) })} title="Show this customer's orders">{o.customer}</button><br /><span className="muted small">{o.company || o.email}</span></td>
                  <td>{o.destination}</td>
                  <td className="wrap small"><CustomCell c={o.customisation} to={`/admin/orders/${o.orderNumber}#customisation`} /></td>
                  <td><SupplierCell s={o.supplier} type={o.fulfilmentType} /></td>
                  <td><PaymentPill status={o.paymentStatus} /></td>
                  <td><StatusPill status={o.status} /></td>
                  <td className="num">{formatMoney(o.total, o.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="pager">
          <button className="btn btn--outline btn--sm" disabled={page <= 1} onClick={() => setFilter({ page: String(page - 1) })}>← Previous</button>
          <span className="muted small">Page {page} of {pages}</span>
          <button className="btn btn--outline btn--sm" disabled={page >= pages} onClick={() => setFilter({ page: String(page + 1) })}>Next →</button>
        </div>
      )}

      {grouping && (
        <GroupOrderModal
          orderNumbers={grouping}
          onClose={() => setGrouping(null)}
          onPlaced={() => { setSel(new Map()); load(); }}
        />
      )}
    </section>
  );
}
