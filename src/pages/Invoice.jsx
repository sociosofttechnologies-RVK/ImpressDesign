import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import RequireAuth from '../components/RequireAuth.jsx';
import { api, formatDate, formatMoney } from '../lib/api.js';

const Addr = ({ a }) => (
  <address className="addr">
    {a.name}{a.company ? <><br />{a.company}</> : null}<br />
    {a.street1}{a.street2 ? <><br />{a.street2}</> : null}<br />
    {a.postCode} {a.city}, {a.country}
    {a.email ? <><br />{a.email}</> : null}
  </address>
);

function InvoiceInner() {
  const { number } = useParams();
  const [inv, setInv] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api(`/invoices/${number}`).then(setInv).catch((e) => setError(e.message)); }, [number]);
  if (error) return <section className="container placeholder"><p>{error}</p></section>;
  if (!inv) return <section className="container placeholder"><p className="muted">Loading…</p></section>;
  const c = inv.totals.currency;
  return (
    <div className="page">
      <div className="container invoice">
        <div className="invoice__bar no-print"><button className="btn btn--dark" onClick={() => window.print()}>Print / save as PDF</button></div>
        <article className="invoice__sheet">
          <header className="invoice__head">
            <div>
              <img src="/images/logo.png" alt={inv.seller.name} width="202" height="30" />
              <p className="small">{inv.seller.address}{inv.seller.vat ? <><br />VAT {inv.seller.vat}</> : null}{inv.seller.email ? <><br />{inv.seller.email}</> : null}</p>
            </div>
            <div className="invoice__meta">
              <h1 className="h2">Invoice</h1>
              <p>No. <strong>{inv.number}</strong><br />Date {formatDate(inv.issuedAt)}<br />Order {inv.orderNumber} ({formatDate(inv.orderDate)})</p>
            </div>
          </header>
          <div className="invoice__addrs">
            <div><h2 className="pdp__label">Bill to</h2><Addr a={inv.billTo} /></div>
            <div><h2 className="pdp__label">Ship to</h2><Addr a={inv.shipTo} /></div>
          </div>
          <table className="table table--light">
            <thead><tr><th>Description</th><th>Qty</th><th>Unit (excl. VAT)</th><th>Total</th></tr></thead>
            <tbody>
              {inv.lines.map((l, i) => <tr key={i}><td className="wrap">{l.description}</td><td>{l.qty}</td><td>{formatMoney(l.unit, c)}</td><td>{formatMoney(l.total, c)}</td></tr>)}
            </tbody>
          </table>
          <dl className="totals invoice__totals">
            <dt>Total excl. VAT</dt><dd>{formatMoney(inv.totals.goods + inv.totals.marking + inv.totals.shipping, c)}</dd>
            <dt>VAT {Math.round(inv.totals.taxRate * 100)}%</dt><dd>{formatMoney(inv.totals.tax, c)}</dd>
            <dt className="totals__grand">Total incl. VAT</dt><dd className="totals__grand">{formatMoney(inv.totals.grand, c)}</dd>
          </dl>
        </article>
      </div>
    </div>
  );
}

export default function Invoice() {
  return <RequireAuth><InvoiceInner /></RequireAuth>;
}
