// Customer account: profile, password and address book.
import bcrypt from 'bcryptjs';
import { query, one, tx } from '../db.js';
import { HttpError } from '../lib/http.js';

const MAX_ADDRESSES = 10;

export const addressView = (a) => a && ({
  id: a.id, contactName: a.contact_name, company: a.company, phone: a.phone, street1: a.street1, street2: a.street2,
  postCode: a.post_code, city: a.city, country: a.country, isDefault: !!a.is_default,
});

// ------------------------------------------------------------------ profile
export async function updateProfile(userId, body) {
  const u = await one('SELECT * FROM users WHERE id = ?', [userId]);
  if (!u) throw new HttpError(404, 'Account not found');
  const name = body.name !== undefined ? String(body.name).trim() : u.name;
  const phone = body.phone !== undefined ? String(body.phone).trim() || null : u.phone;
  const email = body.email !== undefined ? String(body.email).trim().toLowerCase() : u.email;
  if (!name) throw new HttpError(400, 'Name cannot be empty');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter a valid email');
  if (email !== u.email) {
    if (!body.currentPassword || !(await bcrypt.compare(String(body.currentPassword), u.password_hash))) {
      throw new HttpError(403, 'Enter your current password to change your email');
    }
    if (await one('SELECT id FROM users WHERE email = ? AND id <> ?', [email, userId])) throw new HttpError(409, 'Another account already uses this email');
  }
  await query('UPDATE users SET name = ?, phone = ?, email = ? WHERE id = ?', [name, phone, email, userId]);
  return one('SELECT * FROM users WHERE id = ?', [userId]);
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const u = await one('SELECT * FROM users WHERE id = ?', [userId]);
  if (!u || !(await bcrypt.compare(String(currentPassword || ''), u.password_hash))) throw new HttpError(403, 'Current password is incorrect');
  if (String(newPassword || '').length < 8) throw new HttpError(400, 'New password must be at least 8 characters');
  await query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(String(newPassword), 10), userId]);
  return { ok: true };
}

/** Counts for the account overview. */
export async function accountSummary(userId) {
  const [row] = await query(
    `SELECT COUNT(*) AS orders,
            SUM(CASE WHEN status NOT IN ('delivered','cancelled') THEN 1 ELSE 0 END) AS open_orders,
            SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered
     FROM orders WHERE user_id = ?`, [userId]);
  return { orders: Number(row?.orders || 0), inProgress: Number(row?.open_orders || 0), delivered: Number(row?.delivered || 0) };
}

// ------------------------------------------------------------------ addresses
const FIELDS = ['contactName', 'phone', 'street1', 'postCode', 'city', 'country'];

function clean(a = {}) {
  for (const f of FIELDS) if (!String(a[f] || '').trim()) throw new HttpError(400, `Address field "${f}" is required`);
  return {
    contactName: String(a.contactName).trim(), company: String(a.company || '').trim() || null, phone: String(a.phone).trim(),
    street1: String(a.street1).trim(), street2: String(a.street2 || '').trim() || null, postCode: String(a.postCode).trim(),
    city: String(a.city).trim(), country: String(a.country).trim().toUpperCase().slice(0, 2),
  };
}
const vals = (c) => [c.contactName, c.company, c.phone, c.street1, c.street2, c.postCode, c.city, c.country];

export const listAddresses = async (userId) =>
  (await query('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC', [userId])).map(addressView);

export async function addAddress(userId, body, db = null) {
  const c = clean(body);
  const run = async (d) => {
    const count = await d.one('SELECT COUNT(*) AS n FROM addresses WHERE user_id = ?', [userId]);
    if (Number(count.n) >= MAX_ADDRESSES) throw new HttpError(400, `You can save up to ${MAX_ADDRESSES} addresses`);
    const makeDefault = Number(count.n) === 0 || !!body.isDefault;
    if (makeDefault) await d.query('UPDATE addresses SET is_default = 0 WHERE user_id = ?', [userId]);
    const r = await d.query(
      'INSERT INTO addresses (contact_name, company, phone, street1, street2, post_code, city, country, is_default, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [...vals(c), makeDefault ? 1 : 0, userId]);
    return r.insertId;
  };
  const id = db ? await run(db) : await tx(run);
  return addressView(await (db || { one }).one('SELECT * FROM addresses WHERE id = ?', [id]));
}

export async function updateAddress(userId, id, body) {
  const a = await one('SELECT * FROM addresses WHERE id = ? AND user_id = ?', [id, userId]);
  if (!a) throw new HttpError(404, 'Address not found');
  const c = clean(body);
  await tx(async (d) => {
    await d.query('UPDATE addresses SET contact_name=?, company=?, phone=?, street1=?, street2=?, post_code=?, city=?, country=? WHERE id = ?', [...vals(c), id]);
    if (body.isDefault) {
      await d.query('UPDATE addresses SET is_default = 0 WHERE user_id = ?', [userId]);
      await d.query('UPDATE addresses SET is_default = 1 WHERE id = ?', [id]);
    }
  });
  return addressView(await one('SELECT * FROM addresses WHERE id = ?', [id]));
}

export async function setDefaultAddress(userId, id) {
  const a = await one('SELECT id FROM addresses WHERE id = ? AND user_id = ?', [id, userId]);
  if (!a) throw new HttpError(404, 'Address not found');
  await tx(async (d) => {
    await d.query('UPDATE addresses SET is_default = 0 WHERE user_id = ?', [userId]);
    await d.query('UPDATE addresses SET is_default = 1 WHERE id = ?', [id]);
  });
  return listAddresses(userId);
}

export async function deleteAddress(userId, id) {
  const a = await one('SELECT * FROM addresses WHERE id = ? AND user_id = ?', [id, userId]);
  if (!a) throw new HttpError(404, 'Address not found');
  await tx(async (d) => {
    await d.query('DELETE FROM addresses WHERE id = ?', [id]);
    if (a.is_default) {
      const next = await d.one('SELECT id FROM addresses WHERE user_id = ? ORDER BY id DESC LIMIT 1', [userId]);
      if (next) await d.query('UPDATE addresses SET is_default = 1 WHERE id = ?', [next.id]);
    }
  });
  return listAddresses(userId);
}

/** Checkout: save the delivery address to the book unless an identical one is already there. */
export async function rememberAddress(db, userId, address) {
  let c;
  try { c = clean(address); } catch { return; }
  const same = await db.one(
    `SELECT id FROM addresses WHERE user_id = ? AND contact_name = ? AND phone = ? AND street1 = ? AND COALESCE(street2,'') = ?
       AND post_code = ? AND city = ? AND country = ? AND COALESCE(company,'') = ?`,
    [userId, c.contactName, c.phone, c.street1, c.street2 || '', c.postCode, c.city, c.country, c.company || '']);
  if (same) return;
  const count = await db.one('SELECT COUNT(*) AS n FROM addresses WHERE user_id = ?', [userId]);
  if (Number(count.n) >= MAX_ADDRESSES) return;
  await addAddress(userId, { ...address, isDefault: Number(count.n) === 0 }, db);
}
