// Admin → Users: list, create and edit customer and admin accounts.
import bcrypt from 'bcryptjs';
import { query, one } from '../db.js';
import { HttpError } from '../lib/http.js';
import { listAddresses } from './account.service.js';

const ROLES = ['customer', 'admin'];

const userRow = (u) => ({
  id: u.id, email: u.email, name: u.name, phone: u.phone, role: u.role, blocked: !!Number(u.disabled || 0), createdAt: u.created_at,
  orders: Number(u.orders || 0), openOrders: Number(u.open_orders || 0), spent: Number(u.spent || 0), lastOrderAt: u.last_order_at || null,
});

const STATS = `
  (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS orders,
  (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id AND o.status NOT IN ('delivered','cancelled')) AS open_orders,
  (SELECT SUM(o.grand_total) FROM orders o WHERE o.user_id = u.id AND o.status <> 'cancelled') AS spent,
  (SELECT MAX(o.created_at) FROM orders o WHERE o.user_id = u.id) AS last_order_at`;

/** Filters: q (name / email / phone), role, state (active | blocked), sort. */
export async function listUsers({ q, role, state, sort = 'newest', page = 1, pageSize = 50 } = {}) {
  const where = [], params = [];
  if (q) { where.push('(u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (ROLES.includes(role)) { where.push('u.role = ?'); params.push(role); }
  if (state === 'active') where.push('u.disabled = 0');
  if (state === 'blocked') where.push('u.disabled = 1');
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const order = { newest: 'u.id DESC', oldest: 'u.id ASC', name: 'u.name ASC', orders: 'orders DESC, u.id DESC', spent: 'spent DESC, u.id DESC' }[sort] || 'u.id DESC';
  const size = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 50));
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const [{ n }] = await query(`SELECT COUNT(*) AS n FROM users u ${w}`, params);
  const rows = await query(`SELECT u.*, ${STATS} FROM users u ${w} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, size, (pg - 1) * size]);
  const [counts] = await query(`SELECT COUNT(*) AS total, SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS admins,
    SUM(CASE WHEN disabled = 1 THEN 1 ELSE 0 END) AS blocked FROM users`);
  return {
    items: rows.map(userRow), total: Number(n), page: pg, pageSize: size,
    counts: { total: Number(counts.total || 0), admins: Number(counts.admins || 0), blocked: Number(counts.blocked || 0) },
  };
}

export async function getUser(id) {
  const u = await one(`SELECT u.*, ${STATS} FROM users u WHERE u.id = ?`, [id]);
  if (!u) throw new HttpError(404, 'User not found');
  const recent = await query(
    'SELECT order_number, status, grand_total, currency, created_at FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 10', [id]);
  return {
    ...userRow(u),
    addresses: await listAddresses(id),
    recentOrders: recent.map((r) => ({ orderNumber: r.order_number, status: r.status, total: Number(r.grand_total), currency: r.currency, createdAt: r.created_at })),
  };
}

const cleanEmail = (e) => {
  const email = String(e || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter a valid email');
  return email;
};

export async function createUser(body = {}) {
  const email = cleanEmail(body.email);
  const name = String(body.name || '').trim();
  if (!name) throw new HttpError(400, 'Name is required');
  if (String(body.password || '').length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  const role = ROLES.includes(body.role) ? body.role : 'customer';
  if (await one('SELECT id FROM users WHERE email = ?', [email])) throw new HttpError(409, 'An account with this email already exists');
  const hash = await bcrypt.hash(String(body.password), 10);
  const r = await query('INSERT INTO users (email, password_hash, name, phone, role) VALUES (?, ?, ?, ?, ?)',
    [email, hash, name, String(body.phone || '').trim() || null, role]);
  return getUser(r.insertId);
}

/**
 * Edits name, email, phone, role, blocked flag and (optionally) sets a new password.
 * Guards: an admin cannot demote or block themselves, and the last active admin cannot be removed.
 */
export async function updateUser(actorId, id, body = {}) {
  const u = await one('SELECT * FROM users WHERE id = ?', [id]);
  if (!u) throw new HttpError(404, 'User not found');
  const name = body.name !== undefined ? String(body.name).trim() : u.name;
  if (!name) throw new HttpError(400, 'Name cannot be empty');
  const email = body.email !== undefined ? cleanEmail(body.email) : u.email;
  if (email !== u.email && await one('SELECT id FROM users WHERE email = ? AND id <> ?', [email, id])) throw new HttpError(409, 'Another account already uses this email');
  const phone = body.phone !== undefined ? String(body.phone).trim() || null : u.phone;
  const role = body.role !== undefined ? body.role : u.role;
  if (!ROLES.includes(role)) throw new HttpError(400, 'Role must be customer or admin');
  const disabled = body.blocked !== undefined ? (body.blocked ? 1 : 0) : Number(u.disabled || 0);

  const self = Number(actorId) === Number(id);
  if (self && role !== 'admin') throw new HttpError(409, 'You cannot remove your own admin access');
  if (self && disabled) throw new HttpError(409, 'You cannot block your own account');
  const losingAdmin = u.role === 'admin' && !Number(u.disabled || 0) && (role !== 'admin' || disabled);
  if (losingAdmin) {
    const [{ n }] = await query("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled = 0 AND id <> ?", [id]);
    if (Number(n) === 0) throw new HttpError(409, 'This is the only active admin — make someone else admin first');
  }

  await query('UPDATE users SET name = ?, email = ?, phone = ?, role = ?, disabled = ? WHERE id = ?', [name, email, phone, role, disabled, id]);
  if (body.password) {
    if (String(body.password).length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(String(body.password), 10), id]);
  }
  return getUser(id);
}
