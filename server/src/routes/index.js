import { Router } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { query, one } from '../db.js';
import { config, toptexConfigured } from '../config.js';
import { ah, HttpError, required } from '../lib/http.js';
import { auth, adminOnly, signToken } from '../middleware/auth.js';
import * as catalog from '../services/catalog.service.js';
import { quoteOrder } from '../services/pricing.service.js';
import * as orders from '../services/orders.service.js';
import * as vendor from '../services/vendor.service.js';
import { syncCatalog, syncStatus } from '../services/sync.service.js';
import * as account from '../services/account.service.js';
import * as users from '../services/admin-users.service.js';

export const api = Router();

// ------------------------------------------------------------------ health
api.get('/health', ah(async (_req, res) => {
  await query('SELECT 1');
  res.json({ ok: true, catalog: catalog.catalogMeta(), toptex: toptexConfigured() ? 'live' : 'dry-run', vendorOrderMode: config.vendorOrderMode, shippingProvider: config.shipping.provider });
}));

// ------------------------------------------------------------------ auth
const userView = (u) => ({ id: u.id, email: u.email, name: u.name, phone: u.phone, role: u.role });

api.post('/auth/register', ah(async (req, res) => {
  required(req.body, ['email', 'password', 'name']);
  const email = String(req.body.email).trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter a valid email');
  if (String(req.body.password).length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  if (await one('SELECT id FROM users WHERE email = ?', [email])) throw new HttpError(409, 'An account with this email already exists');
  const hash = await bcrypt.hash(String(req.body.password), 10);
  const r = await query('INSERT INTO users (email, password_hash, name, phone) VALUES (?, ?, ?, ?)', [email, hash, String(req.body.name).trim(), req.body.phone || null]);
  const u = await one('SELECT * FROM users WHERE id = ?', [r.insertId]);
  res.status(201).json({ token: signToken(u), user: userView(u) });
}));

api.post('/auth/login', ah(async (req, res) => {
  required(req.body, ['email', 'password']);
  const u = await one('SELECT * FROM users WHERE email = ?', [String(req.body.email).trim().toLowerCase()]);
  if (!u || !(await bcrypt.compare(String(req.body.password), u.password_hash))) throw new HttpError(401, 'Wrong email or password');
  if (Number(u.disabled)) throw new HttpError(403, 'This account has been blocked. Please contact us.');
  res.json({ token: signToken(u), user: userView(u) });
}));

api.get('/me', auth, ah(async (req, res) => {
  const u = await one('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!u || Number(u.disabled)) throw new HttpError(401, u ? 'This account has been blocked' : 'Account not found');
  const addresses = await account.listAddresses(u.id);
  res.json({
    user: { ...userView(u), memberSince: u.created_at },
    address: addresses.find((x) => x.isDefault) || null, // default address, used to prefill checkout
    addresses,
    summary: await account.accountSummary(u.id),
  });
}));

// ------------------------------------------------------------------ my account
api.patch('/me', auth, ah(async (req, res) => {
  const u = await account.updateProfile(req.user.id, req.body);
  res.json({ user: userView(u), token: signToken(u) }); // new token carries the updated name/email
}));
api.post('/me/password', auth, ah(async (req, res) => res.json(await account.changePassword(req.user.id, req.body))));
api.get('/me/addresses', auth, ah(async (req, res) => res.json(await account.listAddresses(req.user.id))));
api.post('/me/addresses', auth, ah(async (req, res) => res.status(201).json(await account.addAddress(req.user.id, req.body))));
api.put('/me/addresses/:id', auth, ah(async (req, res) => res.json(await account.updateAddress(req.user.id, Number(req.params.id), req.body))));
api.post('/me/addresses/:id/default', auth, ah(async (req, res) => res.json(await account.setDefaultAddress(req.user.id, Number(req.params.id)))));
api.delete('/me/addresses/:id', auth, ah(async (req, res) => res.json(await account.deleteAddress(req.user.id, Number(req.params.id)))));

// ------------------------------------------------------------------ catalog (paged for infinite scroll)
api.get('/products', (req, res) => { res.set('Cache-Control', 'public, max-age=60'); res.json(catalog.search(req.query)); });
api.get('/products/facets', (_req, res) => { res.set('Cache-Control', 'public, max-age=300'); res.json(catalog.facets()); });
api.get('/products/:slug', (req, res, next) => {
  const p = catalog.getProduct(req.params.slug);
  if (!p) return next(new HttpError(404, 'Product not found'));
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ product: p, related: catalog.related(p) });
});

// ------------------------------------------------------------------ artwork uploads
fs.mkdirSync(config.uploads.dir, { recursive: true });
const ALLOWED = /\.(png|jpe?g|gif|webp|svg|pdf|ai|eps)$/i;
const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploads.dir,
    filename: (_req, f, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(f.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: config.uploads.maxBytes },
  fileFilter: (_req, f, cb) => cb(ALLOWED.test(f.originalname) ? null : new HttpError(400, 'Artwork must be an image, PDF, AI or EPS file'), ALLOWED.test(f.originalname)),
});

api.post('/uploads', upload.single('file'), ah(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No file received');
  const r = await query('INSERT INTO uploads (original_name, stored_name, mime, size_bytes) VALUES (?, ?, ?, ?)',
    [req.file.originalname.slice(0, 255), req.file.filename, req.file.mimetype, req.file.size]);
  res.status(201).json({ id: r.insertId, name: req.file.originalname });
}));

api.get('/admin/uploads/:id', auth, adminOnly, ah(async (req, res) => {
  const u = await one('SELECT * FROM uploads WHERE id = ?', [req.params.id]);
  if (!u) throw new HttpError(404, 'File not found');
  res.download(path.join(config.uploads.dir, u.stored_name), u.original_name);
}));

// ------------------------------------------------------------------ checkout
api.post('/checkout/quote', ah(async (req, res) => {
  res.json(await quoteOrder({ lines: req.body.lines, address: req.body.address, shippingMethod: req.body.shippingMethod }));
}));

api.post('/orders', auth, ah(async (req, res) => {
  res.status(201).json(await orders.placeOrder(req.user, req.body));
}));

api.get('/orders', auth, ah(async (req, res) => res.json(await orders.listOrders({ userId: req.user.id }))));
api.get('/orders/:number', auth, ah(async (req, res) => res.json(await orders.getOrderDetail(req.params.number, { userId: req.user.id, admin: req.user.role === 'admin' }))));
api.post('/orders/:number/feedback', auth, ah(async (req, res) => res.json(await orders.leaveFeedback(req.user, req.params.number, req.body))));
api.get('/invoices/:number', auth, ah(async (req, res) => res.json(await orders.getInvoice(req.params.number, { userId: req.user.id, admin: req.user.role === 'admin' }))));

// ------------------------------------------------------------------ admin
const admin = Router();
admin.use(auth, adminOnly);

admin.get('/orders', ah(async (req, res) => res.json(await orders.adminListOrders(req.query))));
admin.get('/orders-countries', ah(async (_req, res) => res.json(await orders.orderCountries())));
admin.post('/orders/bulk/status', ah(async (req, res) => res.json(await orders.bulkSetStatus(req.body.orderNumbers, req.body.status, req.body.note))));
admin.post('/orders/bulk/payment', ah(async (req, res) => res.json(await orders.bulkSetPayment(req.body.orderNumbers, req.body.status))));
admin.get('/orders/:number', ah(async (req, res) => res.json(await orders.getOrderDetail(req.params.number, { admin: true }))));
admin.patch('/orders/:number', ah(async (req, res) => res.json(await orders.adminUpdateOrder(req.params.number, req.body))));
admin.post('/orders/:number/status', ah(async (req, res) => res.json(await orders.adminSetStatus(req.params.number, req.body.status, req.body.note, { force: !!req.body.force }))));
admin.post('/orders/:number/payment', ah(async (req, res) => {
  if (!['unpaid', 'paid', 'refunded'].includes(req.body.status)) throw new HttpError(400, 'Invalid payment status');
  await query('UPDATE orders SET payment_status = ? WHERE order_number = ?', [req.body.status, req.params.number]);
  res.json(await orders.getOrderDetail(req.params.number, { admin: true }));
}));
admin.post('/orders/:number/shipments', ah(async (req, res) => res.status(201).json(await orders.createShipment(req.params.number, req.body))));
admin.post('/shipments/:id/events', ah(async (req, res) => res.json(await orders.addShipmentEvent(req.params.id, req.body))));
admin.post('/shipments/:id/refresh', ah(async (req, res) => res.json(await orders.refreshTracking(req.params.id))));

admin.get('/vendor/pending', ah(async (_req, res) => res.json(await vendor.pendingItems())));
admin.get('/vendor/orders', ah(async (_req, res) => res.json(await vendor.listVendorOrders())));
admin.get('/vendor/orders/:id', ah(async (req, res) => res.json(await vendor.getVendorOrder(req.params.id))));
admin.post('/vendor/orders', ah(async (req, res) => res.status(201).json(await vendor.placeVendorOrder({ itemIds: req.body.itemIds, mode: 'grouped', userId: req.user.id, express: !!req.body.express }))));
// Group the garments of selected customer orders into one TopTex order (preview first, then place).
admin.post('/vendor/group-preview', ah(async (req, res) => res.json(await vendor.groupPreview(req.body.orderNumbers))));
admin.post('/vendor/group-orders', ah(async (req, res) => res.status(201).json(await vendor.placeGroupedFromOrders({ orderNumbers: req.body.orderNumbers, userId: req.user.id, express: !!req.body.express }))));
admin.post('/vendor/orders/:id/received', ah(async (req, res) => res.json(await vendor.markReceived(req.params.id))));
admin.get('/vendor/deliveries', ah(async (_req, res) => res.json(await vendor.vendorDeliveries())));

admin.get('/users', ah(async (req, res) => res.json(await users.listUsers(req.query))));
admin.post('/users', ah(async (req, res) => res.status(201).json(await users.createUser(req.body))));
admin.get('/users/:id', ah(async (req, res) => res.json(await users.getUser(Number(req.params.id)))));
admin.patch('/users/:id', ah(async (req, res) => res.json(await users.updateUser(req.user.id, Number(req.params.id), req.body))));

admin.get('/feedback', ah(async (_req, res) => res.json(await orders.listFeedback())));
admin.get('/catalog', (_req, res) => res.json(syncStatus()));
// Starts a sync in the background; the admin page polls GET /admin/catalog for progress.
admin.post('/catalog/sync', ah(async (_req, res) => {
  syncCatalog({ log: (m) => console.log(`[catalog] ${m}`) }).catch((e) => console.error(`[catalog] sync failed: ${e.message}`));
  res.status(202).json(syncStatus());
}));

api.use('/admin', admin);
