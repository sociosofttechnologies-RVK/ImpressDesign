import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import RequireAuth from '../../components/RequireAuth.jsx';
import { COUNTRIES, ItemsTable, PaymentPill, Shipments, STATUS_LABEL, StatusPill, Timeline, Totals } from '../../components/OrderBits.jsx';
import { api, download, formatDate } from '../../lib/api.js';
import GroupOrderModal from './GroupOrderModal.jsx';
import CustomisationPanel from './AdminCustomisation.jsx';

const EVENT_STATUSES = [['in_transit', 'In transit'], ['out_for_delivery', 'Out for delivery'], ['delivered', 'Delivered'], ['exception', 'Delivery problem']];

function ShipForm({ order, onDone, setError }) {
  const direct = order.fulfilmentType === 'direct';
  const [manual, setManual] = useState(direct);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true); setError('');
    try {
      await api(`/admin/orders/${order.orderNumber}/shipments`, { method: 'POST', body: manual ? f : {} });
      onDone();
    } catch (err) { setError(err.message); }
    setBusy(false);
  };
  return (
    <form className="panel stack" onSubmit={submit}>
      <h2 className="h3">{direct ? 'Record supplier delivery' : 'Ship this order'}</h2>
      <p className="muted small">
        {direct
          ? 'TopTex ships this order straight to the customer. Copy the carrier and tracking number from the TopTex delivery note.'
          : `Books the parcel with the delivery partner (${order.weightKg} kg, ${order.shippingMethod}) and issues the invoice.`}
      </p>
      {!direct && <label className="check"><input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} /><span>Enter tracking manually instead</span></label>}
      {manual && (
        <div className="form form--flat">
          <label>Carrier<input name="carrier" required placeholder="e.g. DPD, Colissimo" /></label>
          <label>Tracking number<input name="trackingNumber" required /></label>
          <label className="form__wide">Tracking link (optional)<input name="trackingUrl" type="url" placeholder="https://…" /></label>
        </div>
      )}
      <button className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : direct || manual ? 'Save shipment' : 'Create shipment'}</button>
    </form>
  );
}

function EventForm({ shipment, onDone, setError }) {
  const submit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setError('');
    try { await api(`/admin/shipments/${shipment.id}/events`, { method: 'POST', body: f }); e.target.reset(); onDone(); } catch (err) { setError(err.message); }
  };
  const refresh = async () => {
    setError('');
    try { const r = await api(`/admin/shipments/${shipment.id}/refresh`, { method: 'POST' }); if (!r.updated) setError('No new tracking events from the delivery partner.'); onDone(); } catch (err) { setError(err.message); }
  };
  return (
    <form className="event-form" onSubmit={submit}>
      <select name="status" aria-label="Tracking status">{EVENT_STATUSES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <input name="location" placeholder="Location" aria-label="Location" />
      <input name="description" placeholder="Note (optional)" aria-label="Note" />
      <button className="btn btn--outline btn--sm">Add update</button>
      {shipment.source === 'partner' && <button type="button" className="link link--strong" onClick={refresh}>Fetch from partner</button>}
    </form>
  );
}

/** Any status in this order's flow (or cancelled). Steps outside the normal next action need confirming. */
function StatusOverride({ order, onSaved, setError }) {
  const options = [...order.flow, 'cancelled'].filter((s) => s !== order.status);
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    if (!status) return;
    const normal = order.nextActions.some((a) => a.action === 'status' && a.status === status);
    if (!normal && !window.confirm(`Set order ${order.orderNumber} to “${STATUS_LABEL[status]}”?\n\nThis skips the normal flow: it only changes the status (no supplier order, shipment or invoice is created) and is shown to the customer.`)) return;
    setBusy(true); setError('');
    try { onSaved(await api(`/admin/orders/${order.orderNumber}/status`, { method: 'POST', body: { status, note, force: !normal } })); setStatus(''); setNote(''); } catch (err) { setError(err.message); }
    setBusy(false);
  };
  return (
    <form className="inline-form" onSubmit={save}>
      <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="New status">
        <option value="">Change status to…</option>
        {options.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
      </select>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} placeholder="Note for the timeline (optional)" aria-label="Note" />
      <button className="btn btn--dark btn--sm" disabled={!status || busy}>{busy ? 'Saving…' : 'Update status'}</button>
    </form>
  );
}

function DetailsForm({ order, onSaved, onCancel, setError }) {
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true); setError('');
    try { onSaved(await api(`/admin/orders/${order.orderNumber}`, { method: 'PATCH', body: f })); } catch (err) { setError(err.message); }
    setBusy(false);
  };
  const c = order.contact, a = order.shipTo;
  return (
    <form className="form form--flat" onSubmit={submit}>
      <label>Contact name<input name="contactName" required defaultValue={c.name} /></label>
      <label>Company<input name="company" defaultValue={c.company || ''} /></label>
      <label>Email<input name="contactEmail" type="email" required defaultValue={c.email} /></label>
      <label>Phone<input name="contactPhone" required defaultValue={c.phone} /></label>
      <label className="form__wide">Street<input name="street1" required defaultValue={a.street1} /></label>
      <label className="form__wide">Street (line 2)<input name="street2" defaultValue={a.street2 || ''} /></label>
      <label>Post code<input name="postCode" required defaultValue={a.postCode} /></label>
      <label>City<input name="city" required defaultValue={a.city} /></label>
      <label className="form__wide">Country
        <select name="country" defaultValue={a.country}>
          {!COUNTRIES.some(([k]) => k === a.country) && <option value={a.country}>{a.country}</option>}
          {COUNTRIES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="form__wide">Customer notes<textarea name="notes" rows="2" defaultValue={order.notes || ''} /></label>
      <p className="muted small form__wide">Totals and shipping cost are not recalculated when the address changes.</p>
      <div className="actions form__wide">
        <button className="btn btn--primary btn--sm" disabled={busy}>{busy ? 'Saving…' : 'Save details'}</button>
        <button type="button" className="btn btn--outline btn--sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function InternalNotes({ order, onSaved, setError }) {
  const [text, setText] = useState(order.adminNotes || '');
  const [state, setState] = useState('');
  useEffect(() => { setText(order.adminNotes || ''); }, [order.adminNotes]);
  const save = async () => {
    setState('saving'); setError('');
    try { onSaved(await api(`/admin/orders/${order.orderNumber}`, { method: 'PATCH', body: { adminNotes: text } })); setState('saved'); } catch (err) { setError(err.message); setState(''); }
  };
  return (
    <section className="panel">
      <h2 className="h3">Internal notes</h2>
      <textarea className="textarea" rows="4" value={text} onChange={(e) => { setText(e.target.value); setState(''); }} placeholder="Only visible to admins" maxLength={4000} />
      <div className="actions">
        <button className="btn btn--dark btn--sm" disabled={state === 'saving' || text === (order.adminNotes || '')} onClick={save}>{state === 'saving' ? 'Saving…' : 'Save notes'}</button>
        {state === 'saved' && <span className="form-ok">Saved</span>}
      </div>
    </section>
  );
}

function AdminOrderInner() {
  const { number } = useParams();
  const [o, setO] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [grouping, setGrouping] = useState(false);
  const load = useCallback(() => api(`/admin/orders/${number}`).then(setO).catch((e) => setError(e.message)), [number]);
  useEffect(() => { load(); }, [load]);

  if (!o) return <section className="container placeholder">{error ? <p className="form-error">{error}</p> : <p className="muted">Loading…</p>}</section>;

  const act = async (status) => {
    if (status === 'cancelled' && !window.confirm(`Cancel order ${o.orderNumber}?`)) return;
    setBusy(true); setError('');
    try { setO(await api(`/admin/orders/${o.orderNumber}/status`, { method: 'POST', body: { status } })); } catch (e) { setError(e.message); }
    setBusy(false);
  };
  const setPayment = async (status) => {
    try { setO(await api(`/admin/orders/${o.orderNumber}/payment`, { method: 'POST', body: { status } })); } catch (e) { setError(e.message); }
  };
  const canShip = o.nextActions.some((a) => a.action === 'ship');
  const pendingVendor = o.items.some((i) => i.vendorStatus === 'pending');
  const canOrderGarments = pendingVendor && o.fulfilmentType === 'customised' && o.status !== 'cancelled';

  return (
    <div className="page">
      <div className="container">
        <nav className="crumbs"><Link to="/admin">Admin</Link> / <span>{o.orderNumber}</span></nav>
        <div className="page-head">
          <div>
            <h1 className="h1">Order {o.orderNumber}</h1>
            <p className="muted">{formatDate(o.createdAt, true)} · {o.fulfilmentType === 'direct' ? 'Direct — supplier ships to customer' : 'Customised — via workshop'}</p>
          </div>
          <div className="page-head__actions">
            <PaymentPill status={o.paymentStatus} />
            <StatusPill status={o.status} label={o.statusLabel} />
          </div>
        </div>
        {error && <p className="form-error">{error}</p>}

        <div className="order-grid">
          <div className="stack-lg">
            <section className="panel">
              <h2 className="h3">Next step</h2>
              {canOrderGarments && (
                <p>Garments not yet ordered from TopTex. Order them for this order alone, or group with others under <Link className="link link--strong" to="/admin?tab=orders&supplier=to_order&type=customised">Orders → Garments to order</Link>.</p>
              )}
              {o.status === 'materials_ordered' && o.fulfilmentType === 'customised' && (
                <p className="muted">Waiting for the TopTex delivery at the workshop — mark it received under <Link className="link" to="/admin?tab=supplier">Supplier orders</Link>.</p>
              )}
              <div className="actions">
                {canOrderGarments && <button className="btn btn--primary" onClick={() => setGrouping(true)}>Order garments</button>}
                {o.nextActions.filter((a) => a.action === 'status').map((a) => (
                  <button key={a.status} className={`btn ${a.status === 'cancelled' ? 'btn--outline' : 'btn--dark'}`} disabled={busy} onClick={() => act(a.status)}>{a.label}</button>
                ))}
              </div>
              <Timeline flow={o.flow} status={o.status} history={o.history} />
              <StatusOverride order={o} onSaved={setO} setError={setError} />
            </section>

            {canShip && <ShipForm order={o} onDone={load} setError={setError} />}

            {o.shipments.length > 0 && (
              <section className="panel">
                <h2 className="h3">Shipments</h2>
                <Shipments shipments={o.shipments} />
                {o.status === 'shipped' && o.shipments.map((s) => <EventForm key={s.id} shipment={s} onDone={load} setError={setError} />)}
              </section>
            )}

            <section className="panel">
              <h2 className="h3">Items</h2>
              <ItemsTable items={o.items} currency={o.totals.currency} admin onArtwork={(c) => download(`/admin/uploads/${c.artworkId}`, c.artwork).catch((e) => setError(e.message))}
                onUpload={(id, name) => download(`/admin/uploads/${id}`, name).catch((e) => setError(e.message))} />
            </section>
            <CustomisationPanel order={o} onError={setError} />
            {o.notes && !editing && <section className="panel"><h2 className="h3">Customer notes</h2><p className="prewrap">{o.notes}</p></section>}
            <InternalNotes order={o} onSaved={setO} setError={setError} />
            {o.feedback && <section className="panel"><h2 className="h3">Feedback</h2><p>{'★'.repeat(o.feedback.rating)} {o.feedback.comment}</p></section>}
          </div>

          <aside className="stack-lg">
            <section className="panel">
              <h2 className="h3">Totals</h2>
              <Totals t={o.totals} />
              <label className="stack small">Payment
                <select value={o.paymentStatus} onChange={(e) => setPayment(e.target.value)}>
                  <option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="refunded">Refunded</option>
                </select>
              </label>
              {o.invoices.map((v) => <p key={v.number}><Link className="link link--strong" to={`/invoice/${v.number}`}>Invoice {v.number} →</Link></p>)}
            </section>
            <section className="panel">
              <div className="panel__head">
                <h2 className="h3">Customer</h2>
                {!editing && <button className="btn btn--outline btn--sm" onClick={() => setEditing(true)}>Edit</button>}
              </div>
              {editing ? (
                <DetailsForm order={o} setError={setError} onCancel={() => setEditing(false)} onSaved={(next) => { setO(next); setEditing(false); }} />
              ) : (
                <>
                  <address className="addr">
                    <strong>{o.contact.name}</strong>{o.contact.company ? `, ${o.contact.company}` : ''}<br />
                    {o.contact.email}<br />{o.contact.phone}<br /><br />
                    {o.shipTo.street1}{o.shipTo.street2 ? <><br />{o.shipTo.street2}</> : null}<br />
                    {o.shipTo.postCode} {o.shipTo.city}, {o.shipTo.country}
                  </address>
                  <p className="muted small">Delivery: {o.shippingMethod} · zone {o.shippingZone} · {o.weightKg} kg</p>
                  <Link className="link" to={`/admin?tab=orders&user=${o.userId}`}>All orders from this customer →</Link>
                </>
              )}
            </section>
          </aside>
        </div>
      </div>
      {grouping && <GroupOrderModal orderNumbers={[o.orderNumber]} onClose={() => setGrouping(false)} onPlaced={() => load()} />}
    </div>
  );
}

export default function AdminOrder() {
  return <RequireAuth admin><AdminOrderInner /></RequireAuth>;
}
