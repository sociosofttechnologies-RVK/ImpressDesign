import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext.jsx';
import { formatPrice } from '../lib/catalog.js';
import ProductImage from './ProductImage.jsx';
import { Close } from './Icon.jsx';
import { DEMO_MODE } from '../lib/demo.js';

export default function CartDrawer() {
  const { open, setOpen, lines, subtotal, count, setQty, remove } = useCart();
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;
  return (
    <div className="overlay" onClick={() => setOpen(false)}>
      <aside className="drawer" role="dialog" aria-label="Cart" onClick={(e) => e.stopPropagation()}>
        <div className="drawer__head">
          <h2 className="h3">Your cart ({count})</h2>
          <button className="icon-btn" aria-label="Close cart" onClick={() => setOpen(false)}><Close /></button>
        </div>
        {lines.length === 0 ? (
          <div className="drawer__empty">
            <p>Your cart is empty.</p>
            <Link className="btn btn--outline" to="/clothing" onClick={() => setOpen(false)}>Browse clothing →</Link>
          </div>
        ) : (
          <>
            <ul className="drawer__lines">
              {lines.map((l) => (
                <li key={l.key} className="line">
                  <ProductImage src={l.image} alt="" label={l.ref} className="line__img" />
                  <div className="line__body">
                    <Link to={`/clothing/${l.slug}`} onClick={() => setOpen(false)} className="line__name">{l.name}</Link>
                    <p className="line__meta">{l.brand} · {l.color} · {l.size}</p>
                    {l.customisation && (
                      <p className="line__meta">
                        {l.customisation.type}{l.customisation.placements.length ? ` — ${l.customisation.placementLabels.join(', ')}` : ''}
                        {l.customisation.artwork ? ` · ${l.customisation.artwork}` : ''}
                      </p>
                    )}
                    <div className="line__foot">
                      <div className="qty">
                        <button aria-label="Decrease quantity" onClick={() => setQty(l.key, l.qty - 1)}>−</button>
                        <span>{l.qty}</span>
                        <button aria-label="Increase quantity" onClick={() => setQty(l.key, l.qty + 1)}>+</button>
                      </div>
                      <strong>{formatPrice(l.qty * l.price)}</strong>
                    </div>
                  </div>
                  <button className="line__remove" aria-label={`Remove ${l.name}`} onClick={() => remove(l.key)}><Close size={14} /></button>
                </li>
              ))}
            </ul>
            <div className="drawer__foot">
              <div className="drawer__total"><span>Subtotal (garments)</span><strong>{formatPrice(subtotal)}</strong></div>
              <p className="muted small">Garments only, excl. VAT. Marking and delivery are calculated at checkout.</p>
              {DEMO_MODE ? (
                <>
                  <button className="btn btn--primary btn--lg btn--block" disabled aria-disabled="true" style={{ opacity: 0.5, cursor: 'not-allowed' }}>Checkout coming soon</button>
                  <p className="muted small" style={{ textAlign: 'center', marginTop: 8 }}>Online ordering opens shortly — this is a preview.</p>
                </>
              ) : (
                <button className="btn btn--primary btn--lg btn--block" onClick={() => { setOpen(false); navigate('/checkout'); }}>Checkout →</button>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
