import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import RequireAuth from '../components/RequireAuth.jsx';
import ProductImage from '../components/ProductImage.jsx';
import { COUNTRIES, Totals } from '../components/OrderBits.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api, formatMoney } from '../lib/api.js';

const EMPTY = { contactName: '', company: '', phone: '', street1: '', street2: '', postCode: '', city: '', country: 'FR' };

function CheckoutInner() {
  const { lines, clear } = useCart();
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [addr, setAddr] = useState(EMPTY);
  const [saved, setSaved] = useState([]);
  const [notes, setNotes] = useState('');
  const [method, setMethod] = useState('');
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Prefill from the saved address — only fields the customer hasn't typed into yet.
  useEffect(() => {
    refresh().then((me) => {
      setSaved(me?.addresses || []);
      const saved = me?.address
        ? Object.fromEntries(Object.entries(me.address).map(([k, v]) => [k, v || '']))
        : { contactName: me?.user?.name || '', phone: me?.user?.phone || '' };
      setAddr((a) => {
        const next = { ...a };
        for (const [k, v] of Object.entries(saved)) if (v && (!a[k] || (k === 'country' && a[k] === EMPTY.country))) next[k] = v;
        return next;
      });
    });
  }, [refresh]);

  const apiLines = useMemo(() => lines.map((l) => ({
    sku: l.sku, qty: l.qty,
    customisation: l.customisation ? {
      type: l.customisation.type, placements: l.customisation.placements, artworkUploadId: l.customisation.artworkUploadId || null,
      // Design-studio orders: what goes where (text, font, colour, position) + the rendered mock-up for the workshop.
      ...(l.customisation.designs ? { garment: l.customisation.garment, designs: l.customisation.designs, mockupUploadId: l.customisation.mockupUploadId || null } : {}),
    } : null,
  })), [lines]);

  // Re-quote when the cart, destination or method changes (debounced while typing a postcode).
  const destKey = `${addr.country}|${addr.postCode.trim()}`;
  useEffect(() => {
    if (!apiLines.length) return undefined;
    const t = setTimeout(async () => {
      try {
        const address = addr.postCode.trim().length >= 4 ? { country: addr.country, postCode: addr.postCode.trim(), city: addr.city } : null;
        const q = await api('/checkout/quote', { method: 'POST', body: { lines: apiLines, address, shippingMethod: method } });
        setQuote(q);
        setQuoteError('');
        if (q.shippingOptions.length && !q.shippingOptions.some((o) => o.code === method)) setMethod(q.shippingOptions[0].code);
      } catch (e) {
        setQuoteError(e.message);
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiLines, destKey, method]);

  if (!lines.length) {
    return (
      <section className="container placeholder">
        <h1 className="h1">Your cart is empty</h1>
        <Link className="btn btn--outline btn--lg" to="/clothing">Browse clothing →</Link>
      </section>
    );
  }

  const set = (k) => (e) => setAddr((a) => ({ ...a, [k]: e.target.value }));
  const direct = quote?.fulfilmentType === 'direct';

  const place = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const order = await api('/orders', { method: 'POST', body: { lines: apiLines, address: addr, shippingMethod: method, notes, email: user.email } });
      clear();
      navigate(`/account/orders/${order.orderNumber}?placed=1`, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="container">
        <h1 className="h1 page-title">Checkout</h1>
        <form className="checkout" onSubmit={place}>
          <div className="checkout__main">
            <section className="panel">
              <h2 className="h3">Delivery address</h2>
              {saved.length > 0 && (
                <label className="stack">Use a saved address
                  <select defaultValue="" onChange={(e) => {
                    const a = saved.find((x) => String(x.id) === e.target.value);
                    if (a) setAddr({ ...EMPTY, ...Object.fromEntries(Object.entries(a).filter(([k]) => k in EMPTY).map(([k, v]) => [k, v || ''])) });
                  }}>
                    <option value="">Choose…</option>
                    {saved.map((a) => <option key={a.id} value={a.id}>{a.contactName}{a.company ? ` (${a.company})` : ''} — {a.street1}, {a.city}{a.isDefault ? ' · default' : ''}</option>)}
                  </select>
                </label>
              )}
              <div className="form form--flat">
                <label>Contact name<input value={addr.contactName} onChange={set('contactName')} required autoComplete="name" /></label>
                <label>Company (optional)<input value={addr.company} onChange={set('company')} autoComplete="organization" /></label>
                <label>Phone<input value={addr.phone} onChange={set('phone')} required type="tel" autoComplete="tel" /></label>
                <label>Email<input value={user.email} disabled /></label>
                <label className="form__wide">Street address<input value={addr.street1} onChange={set('street1')} required autoComplete="address-line1" /></label>
                <label className="form__wide">Apartment, building (optional)<input value={addr.street2} onChange={set('street2')} autoComplete="address-line2" /></label>
                <label>Postcode<input value={addr.postCode} onChange={set('postCode')} required autoComplete="postal-code" /></label>
                <label>City<input value={addr.city} onChange={set('city')} required autoComplete="address-level2" /></label>
                <label className="form__wide">Country
                  <select value={addr.country} onChange={set('country')} autoComplete="country">
                    {COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
                  </select>
                </label>
              </div>
            </section>

            <section className="panel">
              <h2 className="h3">Delivery method</h2>
              {direct && <p className="note">Nothing in this order is customised, so it ships straight from our supplier's warehouse to you. You'll get the tracking number once it leaves.</p>}
              {!quote?.shippingOptions.length ? (
                <p className="muted">Enter your postcode to see delivery options and prices.</p>
              ) : (
                <div className="options" role="radiogroup" aria-label="Delivery method">
                  {quote.shippingOptions.map((o) => (
                    <label key={o.code} className={`option ${method === o.code ? 'is-on' : ''}`}>
                      <input type="radio" name="method" value={o.code} checked={method === o.code} onChange={() => setMethod(o.code)} />
                      <span className="option__text"><strong>{o.label}</strong><span className="muted small">{o.carrier} · {o.zoneLabel || o.zone}</span></span>
                      <strong>{o.cost ? formatMoney(o.cost, quote.currency) : 'Free'}</strong>
                    </label>
                  ))}
                </div>
              )}
              <label className="stack">Order notes (optional)
                <textarea rows="3" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Deadline, delivery instructions, artwork colours…" />
              </label>
            </section>
          </div>

          <aside className="checkout__side panel">
            <h2 className="h3">Order summary</h2>
            <ul className="mini-lines">
              {(quote?.lines || []).map((l) => {
                const cart = lines.find((c) => c.sku === l.sku) || {};
                return (
                  <li key={`${l.sku}-${l.customisation?.placements?.join(',')}`}>
                    <ProductImage src={l.image || cart.image} alt="" label={l.catalogRef} className="mini-lines__img" />
                    <div>
                      <strong>{l.qty} × {l.name}</strong>
                      <span className="muted small">{l.color} · {l.size}</span>
                      {l.customisation && <span className="small">{l.customisation.type} · {l.customisation.placements.length} placement{l.customisation.placements.length === 1 ? '' : 's'} · {formatMoney(l.markingTotal)}</span>}
                    </div>
                    <span>{formatMoney(l.goodsTotal)}</span>
                  </li>
                );
              })}
            </ul>
            {quote && <Totals t={{ goods: quote.goodsTotal, marking: quote.markingTotal, shipping: quote.shippingCost, taxRate: quote.taxRate, tax: quote.taxTotal, grand: quote.grandTotal, currency: quote.currency }} />}
            {quoteError && <p className="form-error">{quoteError}</p>}
            <p className="muted small">Payment: our team sends a payment link or bank details after confirming your order. Nothing is charged now.</p>
            {error && <p className="form-error">{error}</p>}
            <button className="btn btn--primary btn--lg btn--block" disabled={busy || !quote?.shipping || !!quoteError}>{busy ? 'Placing order…' : 'Place order'}</button>
          </aside>
        </form>
      </div>
    </div>
  );
}

export default function Checkout() {
  return <RequireAuth><CheckoutInner /></RequireAuth>;
}
