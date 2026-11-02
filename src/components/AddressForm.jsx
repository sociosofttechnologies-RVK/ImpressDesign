import { useState } from 'react';
import { COUNTRIES } from './OrderBits.jsx';

export const EMPTY_ADDRESS = { contactName: '', company: '', phone: '', street1: '', street2: '', postCode: '', city: '', country: 'FR' };

/** Add / edit form for the address book. */
export default function AddressForm({ initial, onSave, onCancel, busy, showDefault = true }) {
  const [a, setA] = useState({ ...EMPTY_ADDRESS, ...Object.fromEntries(Object.entries(initial || {}).map(([k, v]) => [k, v ?? ''])) });
  const set = (k) => (e) => setA((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  return (
    <form className="form form--flat" onSubmit={(e) => { e.preventDefault(); onSave(a); }}>
      <label>Full name<input value={a.contactName} onChange={set('contactName')} required autoComplete="name" /></label>
      <label>Company (optional)<input value={a.company} onChange={set('company')} autoComplete="organization" /></label>
      <label className="form__wide">Street address<input value={a.street1} onChange={set('street1')} required autoComplete="address-line1" /></label>
      <label className="form__wide">Apartment, building (optional)<input value={a.street2} onChange={set('street2')} autoComplete="address-line2" /></label>
      <label>Postcode<input value={a.postCode} onChange={set('postCode')} required autoComplete="postal-code" /></label>
      <label>City<input value={a.city} onChange={set('city')} required autoComplete="address-level2" /></label>
      <label>Country
        <select value={a.country} onChange={set('country')} autoComplete="country">
          {COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
        </select>
      </label>
      <label>Phone<input value={a.phone} onChange={set('phone')} required type="tel" autoComplete="tel" /></label>
      {showDefault && !initial?.isDefault && (
        <label className="check form__wide"><input type="checkbox" checked={!!a.isDefault} onChange={set('isDefault')} /><span>Use as my default address</span></label>
      )}
      <div className="actions form__wide">
        <button className="btn btn--dark" disabled={busy}>{busy ? 'Saving…' : 'Save address'}</button>
        {onCancel && <button type="button" className="btn btn--outline" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

export const AddressLines = ({ a }) => (
  <address className="addr">
    <strong>{a.contactName}</strong>{a.company ? <><br />{a.company}</> : null}<br />
    {a.street1}{a.street2 ? <><br />{a.street2}</> : null}<br />
    {a.postCode} {a.city}, {(COUNTRIES.find(([c]) => c === a.country) || [, a.country])[1]}<br />
    {a.phone}
  </address>
);
