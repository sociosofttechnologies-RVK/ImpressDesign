import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import RequireAuth from '../components/RequireAuth.jsx';
import { StatusPill } from '../components/OrderBits.jsx';
import AddressForm, { AddressLines } from '../components/AddressForm.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api, formatDate, formatMoney } from '../lib/api.js';

const TABS = [['overview', 'Overview'], ['orders', 'My orders'], ['profile', 'Profile & security'], ['addresses', 'Addresses']];
const OPEN = (s) => s !== 'delivered' && s !== 'cancelled';

function OrdersTable({ orders }) {
  return (
    <div className="tablewrap">
      <table className="table table--light">
        <thead><tr><th>Order</th><th>Date</th><th>Items</th><th>Status</th><th>Total</th><th /></tr></thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.orderNumber}>
              <td><Link className="link link--strong" to={`/account/orders/${o.orderNumber}`}>{o.orderNumber}</Link></td>
              <td>{formatDate(o.createdAt)}</td>
              <td>{o.units} unit{o.units === 1 ? '' : 's'}</td>
              <td><StatusPill status={o.status} /></td>
              <td>{formatMoney(o.total, o.currency)}</td>
              <td><Link className="link" to={`/account/orders/${o.orderNumber}`}>{OPEN(o.status) ? 'Track' : 'View'}</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const NoOrders = () => <p>No orders yet. <Link className="link link--strong" to="/clothing">Browse clothing →</Link></p>;

function Overview({ me, orders, go }) {
  const s = me.summary;
  const def = me.addresses.find((a) => a.isDefault);
  return (
    <div className="stack-lg">
      <div className="stats">
        <button className="stat" onClick={() => go('orders')}><strong>{s.orders}</strong><span>Orders</span></button>
        <button className="stat" onClick={() => go('orders', 'open')}><strong>{s.inProgress}</strong><span>In progress</span></button>
        <button className="stat" onClick={() => go('orders', 'delivered')}><strong>{s.delivered}</strong><span>Delivered</span></button>
      </div>
      <section className="panel">
        <div className="panel__head"><h2 className="h3">Recent orders</h2>{orders?.length > 3 && <button className="link link--strong" onClick={() => go('orders')}>See all →</button>}</div>
        {!orders ? <p className="muted">Loading…</p> : orders.length ? <OrdersTable orders={orders.slice(0, 3)} /> : <NoOrders />}
      </section>
      <div className="grid-2">
        <section className="panel">
          <div className="panel__head"><h2 className="h3">Account details</h2><button className="link link--strong" onClick={() => go('profile')}>Edit</button></div>
          <p className="addr"><strong>{me.user.name}</strong><br />{me.user.email}<br />{me.user.phone || <span className="muted">No phone number</span>}</p>
          {me.user.memberSince && <p className="muted small">Customer since {formatDate(me.user.memberSince)}</p>}
        </section>
        <section className="panel">
          <div className="panel__head"><h2 className="h3">Default address</h2><button className="link link--strong" onClick={() => go('addresses')}>Manage</button></div>
          {def ? <AddressLines a={def} /> : <p className="muted">No saved address yet — it's added automatically at your first checkout.</p>}
        </section>
      </div>
    </div>
  );
}

function Orders({ orders, filter, setFilter }) {
  const shown = (orders || []).filter((o) => (filter === 'open' ? OPEN(o.status) : filter === 'delivered' ? o.status === 'delivered' : true));
  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="h3">My orders</h2>
        <div className="seg seg--sm" role="tablist" aria-label="Filter orders">
          {[['all', 'All'], ['open', 'In progress'], ['delivered', 'Delivered']].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'is-on' : ''} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
      </div>
      {!orders ? <p className="muted">Loading…</p> : !orders.length ? <NoOrders /> : shown.length ? <OrdersTable orders={shown} /> : <p className="muted">No orders in this view.</p>}
    </section>
  );
}

function Profile({ me, onSaved }) {
  const { applyProfile } = useAuth();
  const [msg, setMsg] = useState(null);
  const [pwMsg, setPwMsg] = useState(null);
  const [email, setEmail] = useState(me.user.email);
  const [busy, setBusy] = useState('');

  const saveProfile = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    setBusy('profile'); setMsg(null);
    try {
      applyProfile(await api('/me', { method: 'PATCH', body: f }));
      setMsg({ ok: true, text: 'Details saved.' });
      onSaved();
    } catch (err) { setMsg({ ok: false, text: err.message }); }
    setBusy('');
  };
  const savePassword = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = Object.fromEntries(new FormData(form));
    if (f.newPassword !== f.confirm) { setPwMsg({ ok: false, text: 'The new passwords do not match.' }); return; }
    setBusy('pw'); setPwMsg(null);
    try {
      await api('/me/password', { method: 'POST', body: { currentPassword: f.currentPassword, newPassword: f.newPassword } });
      form.reset();
      setPwMsg({ ok: true, text: 'Password changed.' });
    } catch (err) { setPwMsg({ ok: false, text: err.message }); }
    setBusy('');
  };
  const emailChanged = email.trim().toLowerCase() !== me.user.email;

  return (
    <div className="grid-2">
      <section className="panel">
        <h2 className="h3">Personal details</h2>
        <form className="form form--flat" onSubmit={saveProfile}>
          <label className="form__wide">Full name<input name="name" defaultValue={me.user.name} required autoComplete="name" /></label>
          <label className="form__wide">Email<input name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
          {emailChanged && <label className="form__wide">Current password (to confirm the new email)<input name="currentPassword" type="password" required autoComplete="current-password" /></label>}
          <label className="form__wide">Phone<input name="phone" type="tel" defaultValue={me.user.phone || ''} autoComplete="tel" /></label>
          {msg && <p className={`form__wide ${msg.ok ? 'form-ok' : 'form-error'}`}>{msg.text}</p>}
          <div className="form__wide"><button className="btn btn--dark" disabled={busy === 'profile'}>{busy === 'profile' ? 'Saving…' : 'Save details'}</button></div>
        </form>
      </section>
      <section className="panel">
        <h2 className="h3">Change password</h2>
        <form className="form form--flat" onSubmit={savePassword}>
          <label className="form__wide">Current password<input name="currentPassword" type="password" required autoComplete="current-password" /></label>
          <label className="form__wide">New password<input name="newPassword" type="password" required minLength={8} autoComplete="new-password" /></label>
          <label className="form__wide">Confirm new password<input name="confirm" type="password" required minLength={8} autoComplete="new-password" /></label>
          <p className="form__wide muted small">At least 8 characters.</p>
          {pwMsg && <p className={`form__wide ${pwMsg.ok ? 'form-ok' : 'form-error'}`}>{pwMsg.text}</p>}
          <div className="form__wide"><button className="btn btn--dark" disabled={busy === 'pw'}>{busy === 'pw' ? 'Saving…' : 'Change password'}</button></div>
        </form>
      </section>
    </div>
  );
}

function Addresses({ me, onChange }) {
  const [editing, setEditing] = useState(null); // 'new' | address id
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const list = me.addresses;

  const run = async (fn) => {
    setBusy(true); setError('');
    try { await fn(); await onChange(); setEditing(null); } catch (e) { setError(e.message); }
    setBusy(false);
  };
  const save = (a) => run(() => (editing === 'new'
    ? api('/me/addresses', { method: 'POST', body: a })
    : api(`/me/addresses/${editing}`, { method: 'PUT', body: a })));
  const remove = (a) => { if (window.confirm(`Delete the address for ${a.contactName}, ${a.city}?`)) run(() => api(`/me/addresses/${a.id}`, { method: 'DELETE' })); };
  const makeDefault = (a) => run(() => api(`/me/addresses/${a.id}/default`, { method: 'POST' }));

  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="h3">Addresses</h2>
        {editing !== 'new' && list.length < 10 && <button className="btn btn--outline btn--sm" onClick={() => setEditing('new')}>+ Add address</button>}
      </div>
      {error && <p className="form-error">{error}</p>}
      {editing === 'new' && <div className="addr-card addr-card--form"><AddressForm initial={{ contactName: me.user.name, phone: me.user.phone || '' }} onSave={save} onCancel={() => setEditing(null)} busy={busy} /></div>}
      {!list.length && editing !== 'new' && <p className="muted">No saved addresses. Add one now, or it will be saved at your next checkout.</p>}
      <div className="addr-grid">
        {list.map((a) => (
          <div key={a.id} className={`addr-card ${a.isDefault ? 'is-default' : ''} ${editing === a.id ? 'addr-card--form' : ''}`}>
            {editing === a.id ? (
              <AddressForm initial={a} onSave={save} onCancel={() => setEditing(null)} busy={busy} />
            ) : (
              <>
                {a.isDefault && <span className="pill pill--delivered">Default</span>}
                <AddressLines a={a} />
                <div className="actions">
                  <button className="link link--strong" onClick={() => setEditing(a.id)}>Edit</button>
                  {!a.isDefault && <button className="link link--strong" disabled={busy} onClick={() => makeDefault(a)}>Set as default</button>}
                  <button className="link" disabled={busy} onClick={() => remove(a)}>Delete</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function AccountInner() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'overview';
  const filter = params.get('filter') || 'all';
  const [me, setMe] = useState(null);
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');

  const loadMe = useCallback(() => api('/me').then(setMe).catch((e) => setError(e.message)), []);
  useEffect(() => {
    loadMe();
    api('/orders').then(setOrders).catch((e) => setError(e.message));
  }, [loadMe]);

  const go = (t, f) => setParams(f ? { tab: t, filter: f } : { tab: t });

  return (
    <div className="page">
      <div className="container">
        <div className="page-head">
          <div>
            <h1 className="h1">My account</h1>
            <p className="muted">Hello, {user.name.split(' ')[0]}</p>
          </div>
          <div className="page-head__actions">
            {isAdmin && <Link className="btn btn--dark" to="/admin">Admin dashboard</Link>}
            <button className="btn btn--outline" onClick={() => { logout(); navigate('/'); }}>Sign out</button>
          </div>
        </div>
        <div className="account">
          <nav className="account__nav" aria-label="My account">
            {TABS.map(([k, label]) => (
              <button key={k} className={tab === k ? 'is-on' : ''} aria-current={tab === k ? 'page' : undefined} onClick={() => go(k)}>{label}</button>
            ))}
          </nav>
          <div className="account__body">
            {error && <p className="form-error">{error}</p>}
            {!me ? <p className="muted">Loading…</p> : (
              <>
                {tab === 'overview' && <Overview me={me} orders={orders} go={go} />}
                {tab === 'orders' && <Orders orders={orders} filter={filter} setFilter={(f) => go('orders', f)} />}
                {tab === 'profile' && <Profile key={me.user.email} me={me} onSaved={loadMe} />}
                {tab === 'addresses' && <Addresses me={me} onChange={loadMe} />}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Account() {
  return <RequireAuth><AccountInner /></RequireAuth>;
}
