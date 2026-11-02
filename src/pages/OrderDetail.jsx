import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import RequireAuth from '../components/RequireAuth.jsx';
import { ItemsTable, Shipments, StatusPill, Timeline, Totals } from '../components/OrderBits.jsx';
import { api, formatDate } from '../lib/api.js';

function Stars({ value, onChange }) {
  return (
    <div className="stars" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button type="button" key={n} role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} className={n <= value ? 'is-on' : ''} onClick={() => onChange?.(n)} disabled={!onChange}>★</button>
      ))}
    </div>
  );
}

function Feedback({ order, onSaved }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  if (order.feedback) {
    return (
      <section className="panel">
        <h2 className="h3">Your feedback</h2>
        <Stars value={order.feedback.rating} />
        {order.feedback.comment && <p>{order.feedback.comment}</p>}
        <p className="muted small">Thank you — sent {formatDate(order.feedback.created_at)}.</p>
      </section>
    );
  }
  if (order.status !== 'delivered') return null;
  const submit = async (e) => {
    e.preventDefault();
    if (!rating) { setError('Choose a rating'); return; }
    try { await api(`/orders/${order.orderNumber}/feedback`, { method: 'POST', body: { rating, comment } }); onSaved(); } catch (err) { setError(err.message); }
  };
  return (
    <section className="panel">
      <h2 className="h3">How did we do?</h2>
      <form className="stack" onSubmit={submit}>
        <Stars value={rating} onChange={setRating} />
        <textarea rows="3" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Quality of the garments, the marking, delivery…" />
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn--dark">Send feedback</button>
      </form>
    </section>
  );
}

function OrderInner() {
  const { number } = useParams();
  const [params] = useSearchParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const load = () => api(`/orders/${number}`).then(setOrder).catch((e) => setError(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [number]);

  if (error) return <section className="container placeholder"><h1 className="h1">Order not found</h1><p>{error}</p><Link className="btn btn--outline" to="/account">My orders</Link></section>;
  if (!order) return <section className="container placeholder"><p className="muted">Loading…</p></section>;

  return (
    <div className="page">
      <div className="container">
        {params.get('placed') && <div className="banner-ok">Thank you! Order <strong>{order.orderNumber}</strong> is confirmed. We'll email you at each step.</div>}
        <nav className="crumbs"><Link to="/account">My account</Link> / <span>{order.orderNumber}</span></nav>
        <div className="page-head">
          <div>
            <h1 className="h1">Order {order.orderNumber}</h1>
            <p className="muted">Placed {formatDate(order.createdAt, true)} · {order.fulfilmentType === 'direct' ? 'Shipped directly from our supplier' : 'Customised at our workshop'}</p>
          </div>
          <StatusPill status={order.status} label={order.statusLabel} />
        </div>

        <div className="order-grid">
          <div className="stack-lg">
            <section className="panel">
              <h2 className="h3">Progress</h2>
              <Timeline flow={order.flow} status={order.status} history={order.history} />
            </section>
            {order.shipments.length > 0 && (
              <section className="panel">
                <h2 className="h3">Tracking</h2>
                <Shipments shipments={order.shipments} />
              </section>
            )}
            <section className="panel">
              <h2 className="h3">Items</h2>
              <ItemsTable items={order.items} currency={order.totals.currency} />
            </section>
            <Feedback order={order} onSaved={load} />
          </div>
          <aside className="stack-lg">
            <section className="panel">
              <h2 className="h3">Summary</h2>
              <Totals t={order.totals} />
              <p className="small">Payment: <strong>{order.paymentStatus}</strong></p>
              {order.invoices.map((v) => <p key={v.number}><Link className="link link--strong" to={`/invoice/${v.number}`}>Invoice {v.number} →</Link></p>)}
            </section>
            <section className="panel">
              <h2 className="h3">Delivery to</h2>
              <address className="addr">
                {order.contact.name}{order.contact.company ? `, ${order.contact.company}` : ''}<br />
                {order.shipTo.street1}{order.shipTo.street2 ? <><br />{order.shipTo.street2}</> : null}<br />
                {order.shipTo.postCode} {order.shipTo.city}, {order.shipTo.country}<br />
                {order.contact.phone}
              </address>
              <p className="muted small">Method: {order.shippingMethod}</p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default function OrderDetail() {
  return <RequireAuth><OrderInner /></RequireAuth>;
}
