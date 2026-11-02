import { useEffect, useState } from 'react';
import { Close } from './Icon.jsx';

// TODO: connect to a real endpoint. For now the request is only kept in this browser (localStorage).
function saveQuoteRequest(payload) {
  try {
    const all = JSON.parse(localStorage.getItem('impress-design-quotes') || '[]');
    localStorage.setItem('impress-design-quotes', JSON.stringify([...all, { ...payload, at: new Date().toISOString() }]));
  } catch { /* storage unavailable */ }
}

export default function QuoteModal({ onClose }) {
  const [sent, setSent] = useState(false);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = (e) => {
    e.preventDefault();
    saveQuoteRequest(Object.fromEntries(new FormData(e.currentTarget)));
    setSent(true);
  };

  return (
    <div className="overlay overlay--center" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Request a quote" onClick={(e) => e.stopPropagation()}>
        <div className="drawer__head">
          <h2 className="h2">Request a quote</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><Close /></button>
        </div>
        {sent ? (
          <div className="modal__done">
            <p>Your request has been saved on this device.</p>
            <p className="muted small">This demo build is not connected to a mail or CRM service yet, so nothing has been sent.</p>
            <button className="btn btn--dark" onClick={onClose}>Close</button>
          </div>
        ) : (
          <form className="form" onSubmit={submit}>
            <label>Name<input name="name" required autoComplete="name" /></label>
            <label>Email<input name="email" type="email" required autoComplete="email" /></label>
            <label>Company<input name="company" autoComplete="organization" /></label>
            <label>Approximate quantity<input name="quantity" type="number" min="1" placeholder="e.g. 150" /></label>
            <label className="form__wide">Your project<textarea name="message" rows="4" required placeholder="Garments, sizes, marking type, deadline…" /></label>
            <button type="submit" className="btn btn--cta form__wide">Send request</button>
          </form>
        )}
      </div>
    </div>
  );
}
