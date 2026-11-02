import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusPill } from '../../components/OrderBits.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { api, formatDate, formatMoney } from '../../lib/api.js';
import AdminModal from './AdminModal.jsx';

function UserForm({ userId, onClose, onSaved }) {
  const { user: me } = useAuth();
  const creating = !userId;
  const [u, setU] = useState(creating ? { role: 'customer', blocked: false } : null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!creating) api(`/admin/users/${userId}`).then(setU).catch((e) => setError(e.message)); }, [userId, creating]);
  const self = u && me && Number(me.id) === Number(u.id);

  const submit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    const body = { name: f.name, email: f.email, phone: f.phone, role: f.role, blocked: f.blocked === 'on' };
    if (f.password) body.password = f.password;
    setBusy(true); setError('');
    try {
      const saved = await api(creating ? '/admin/users' : `/admin/users/${userId}`, { method: creating ? 'POST' : 'PATCH', body });
      onSaved(saved, creating);
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  return (
    <AdminModal title={creating ? 'Add user' : 'Edit user'} onClose={onClose} wide={!creating}>
      {!u ? <p className="muted">{error || 'Loading…'}</p> : (
        <div className={creating ? '' : 'user-edit'}>
          <form className="form form--flat" onSubmit={submit}>
            <label>Name<input name="name" required defaultValue={u.name} autoComplete="off" /></label>
            <label>Email<input name="email" type="email" required defaultValue={u.email} autoComplete="off" /></label>
            <label>Phone<input name="phone" defaultValue={u.phone || ''} autoComplete="off" /></label>
            <label>Role
              <select name="role" defaultValue={u.role} disabled={self}>
                <option value="customer">Customer</option><option value="admin">Admin</option>
              </select>
            </label>
            <label className="form__wide">{creating ? 'Password' : 'New password (leave blank to keep)'}
              <input name="password" type="password" minLength={8} required={creating} autoComplete="new-password" placeholder="At least 8 characters" />
            </label>
            {!creating && (
              <label className="check form__wide"><input type="checkbox" name="blocked" defaultChecked={u.blocked} disabled={self} />
                <span>Blocked — cannot sign in or place orders</span></label>
            )}
            {self && <p className="muted small form__wide">This is your own account: role and block cannot be changed here.</p>}
            {error && <p className="form-error form__wide">{error}</p>}
            <div className="actions form__wide">
              <button className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : creating ? 'Create user' : 'Save changes'}</button>
              <button type="button" className="btn btn--outline" onClick={onClose}>Cancel</button>
            </div>
          </form>

          {!creating && (
            <aside className="stack">
              <dl className="kv">
                <dt>Member since</dt><dd>{formatDate(u.createdAt)}</dd>
                <dt>Orders</dt><dd>{u.orders} ({u.openOrders} open)</dd>
                <dt>Spent</dt><dd>{formatMoney(u.spent)}</dd>
              </dl>
              {u.recentOrders.length > 0 && (
                <>
                  <h3 className="label">Recent orders</h3>
                  <ul className="plain-list">
                    {u.recentOrders.map((o) => (
                      <li key={o.orderNumber} className="row-between">
                        <Link className="link link--strong" to={`/admin/orders/${o.orderNumber}`} onClick={onClose}>{o.orderNumber}</Link>
                        <StatusPill status={o.status} />
                      </li>
                    ))}
                  </ul>
                  <Link className="link" to={`/admin?tab=orders&user=${u.id}`} onClick={onClose}>All orders by this customer →</Link>
                </>
              )}
              {u.addresses.length > 0 && (
                <>
                  <h3 className="label">Saved addresses</h3>
                  {u.addresses.map((a) => (
                    <address key={a.id} className="addr small">{a.contactName}{a.company ? `, ${a.company}` : ''}<br />{a.street1}, {a.postCode} {a.city}, {a.country}</address>
                  ))}
                </>
              )}
            </aside>
          )}
        </div>
      )}
    </AdminModal>
  );
}

export default function AdminUsers() {
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [state, setState] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState(null); // user id, or 'new'

  const load = useCallback(() => {
    api(`/admin/users?${new URLSearchParams({ q, role, state, sort, page, pageSize: 50 })}`).then(setData).catch((e) => setError(e.message));
  }, [q, role, state, sort, page]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { setPage(1); }, [q, role, state, sort]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section className="panel">
      <div className="panel__head">
        <p className="muted small">{data && <><strong>{data.counts.total}</strong> accounts · {data.counts.admins} admin{data.counts.admins === 1 ? '' : 's'} · {data.counts.blocked} blocked</>}</p>
        <button className="btn btn--primary btn--sm" onClick={() => setEditing('new')}>+ Add user</button>
      </div>
      <div className="admin-filters">
        <input type="search" className="admin-filters__search" placeholder="Name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role"><option value="">Role: any</option><option value="customer">Customers</option><option value="admin">Admins</option></select>
        <select value={state} onChange={(e) => setState(e.target.value)} aria-label="Account state"><option value="">State: any</option><option value="active">Active</option><option value="blocked">Blocked</option></select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option><option value="orders">Most orders</option><option value="spent">Highest spend</option>
        </select>
      </div>
      {msg && <p className="banner-ok banner-ok--flush">{msg}</p>}
      {error && <p className="form-error">{error}</p>}
      {!data ? <p className="muted">Loading…</p> : data.items.length === 0 ? <p className="muted">No users match.</p> : (
        <div className="tablewrap">
          <table className="table table--light table--admin">
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th className="num">Orders</th><th className="num">Spent</th><th>Last order</th><th>Joined</th><th /></tr></thead>
            <tbody>
              {data.items.map((u) => (
                <tr key={u.id} className={u.blocked ? 'is-muted' : ''}>
                  <td><button className="link link--strong" onClick={() => setEditing(u.id)}>{u.name}</button></td>
                  <td>{u.email}</td>
                  <td>{u.phone || <span className="muted">—</span>}</td>
                  <td>
                    <span className={`flag ${u.role === 'admin' ? 'flag--dark' : ''}`}>{u.role === 'admin' ? 'Admin' : 'Customer'}</span>
                    {u.blocked && <span className="flag flag--bad">Blocked</span>}
                  </td>
                  <td className="num">{u.orders ? <Link className="link link--strong" to={`/admin?tab=orders&user=${u.id}`}>{u.orders}</Link> : 0}{u.openOrders ? <span className="muted small"> · {u.openOrders} open</span> : ''}</td>
                  <td className="num">{formatMoney(u.spent)}</td>
                  <td>{u.lastOrderAt ? formatDate(u.lastOrderAt) : <span className="muted">—</span>}</td>
                  <td>{formatDate(u.createdAt)}</td>
                  <td><button className="btn btn--outline btn--sm" onClick={() => setEditing(u.id)}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="pager">
          <button className="btn btn--outline btn--sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Previous</button>
          <span className="muted small">Page {page} of {pages}</span>
          <button className="btn btn--outline btn--sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next →</button>
        </div>
      )}
      {editing && (
        <UserForm
          userId={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(u, created) => { setEditing(null); setMsg(created ? `User ${u.email} created.` : `Saved ${u.name}.`); load(); }}
        />
      )}
    </section>
  );
}
