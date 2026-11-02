// Customer orders: placement, status workflow, shipments, invoices and feedback.
import { query, one, tx, json, NOW, docNumber, tempNumber } from '../db.js';
import { config } from '../config.js';
import { HttpError } from '../lib/http.js';
import { quoteOrder, placementLabel } from './pricing.service.js';
import { createShipment as partnerCreateShipment, trackShipment, trackingUrl } from './shipping/index.js';
import { placeVendorOrder } from './vendor.service.js';
import { rememberAddress } from './account.service.js';

export const STATUS_LABEL = {
  placed: 'Order placed',
  materials_ordered: 'Garments ordered from supplier',
  materials_received: 'Garments received at workshop',
  in_customisation: 'Customisation in progress',
  ready_to_ship: 'Ready to ship',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

// Steps shown on the customer timeline.
export const FLOW = {
  customised: ['placed', 'materials_ordered', 'materials_received', 'in_customisation', 'ready_to_ship', 'shipped', 'delivered'],
  direct: ['placed', 'materials_ordered', 'shipped', 'delivered'],
};

// Transitions the admin may trigger by hand. Others happen automatically
// (vendor order placed/received, shipment created, shipment delivered).
const MANUAL = {
  materials_received: ['in_customisation'],
  in_customisation: ['ready_to_ship'],
  shipped: ['delivered'],
};
const CANCELLABLE = ['placed', 'materials_ordered', 'materials_received', 'in_customisation', 'ready_to_ship'];

export async function setStatus(db, orderId, status, note = null) {
  await db.query('UPDATE orders SET status = ? WHERE id = ?', [status, orderId]);
  await db.query('INSERT INTO order_status_history (order_id, status, note) VALUES (?, ?, ?)', [orderId, status, note]);
}

// ------------------------------------------------------------------ place order
export async function placeOrder(user, body) {
  const a = body.address || {};
  for (const f of ['contactName', 'phone', 'street1', 'postCode', 'city', 'country']) {
    if (!String(a[f] || '').trim()) throw new HttpError(400, `Address field "${f}" is required`);
  }
  const address = { ...a, country: String(a.country).toUpperCase().slice(0, 2) };
  const quote = await quoteOrder({ lines: body.lines, address, shippingMethod: body.shippingMethod });
  if (!quote.shipping) throw new HttpError(400, 'Choose a shipping method');

  const orderId = await tx(async (db) => {
    const r = await db.query(
      `INSERT INTO orders (order_number, user_id, fulfilment_type, contact_name, contact_email, contact_phone, company,
         ship_street1, ship_street2, ship_post_code, ship_city, ship_country, shipping_method, shipping_zone, weight_kg,
         goods_total, marking_total, shipping_cost, tax_rate, tax_total, grand_total, currency, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tempNumber(), user.id, quote.fulfilmentType, a.contactName.trim(), (body.email || user.email).trim(), a.phone.trim(), a.company || null,
        a.street1.trim(), a.street2 || null, a.postCode.trim(), a.city.trim(), address.country, quote.shipping.code, quote.shipping.zone, quote.weightKg,
        quote.goodsTotal, quote.markingTotal, quote.shippingCost, quote.taxRate, quote.taxTotal, quote.grandTotal, quote.currency, body.notes || null]
    );
    const id = r.insertId;
    await db.query('UPDATE orders SET order_number = ? WHERE id = ?', [docNumber('ID', id, 5), id]);
    for (const l of quote.lines) {
      await db.query(
        `INSERT INTO order_items (order_id, sku, catalog_ref, product_slug, product_name, brand, color, size, image_url, quantity,
           unit_price, goods_total, customisation_type, placements, artwork_upload_id, design_spec, marking_total, customisation_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, l.sku, l.catalogRef, l.slug, l.name, l.brand, l.color, l.size, l.image, l.qty, l.unitPrice, l.goodsTotal,
          l.customisation?.type || null, l.customisation ? JSON.stringify(l.customisation.placements) : null,
          l.customisation?.artworkUploadId || null, l.customisation?.design ? JSON.stringify(l.customisation.design) : null, l.markingTotal, l.customisation ? 'pending' : 'not_required']
      );
    }
    await db.query('INSERT INTO order_status_history (order_id, status, note) VALUES (?, ?, ?)', [id, 'placed', null]);
    // Save the delivery address to the customer's address book (skipped if it is already there).
    await rememberAddress(db, user.id, { ...a, country: address.country });
    return id;
  });

  // Supplier order: direct orders always go out straight away (delivered to the customer);
  // customised orders go out now only in 'immediate' mode, otherwise they wait for grouping.
  const order = await one('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (order.fulfilment_type === 'direct' || config.vendorOrderMode === 'immediate') {
    const items = await query('SELECT id FROM order_items WHERE order_id = ?', [orderId]);
    try {
      await placeVendorOrder({ itemIds: items.map((i) => i.id), mode: 'immediate', userId: null });
    } catch (e) {
      console.error(`[vendor] order ${order.order_number} could not be sent to TopTex:`, e.message);
    }
  }
  return getOrderDetail(order.order_number, { admin: true });
}

// ------------------------------------------------------------------ read
const money = (n) => Number(n);

export async function getOrderDetail(orderNumber, { userId, admin = false } = {}) {
  const o = await one('SELECT * FROM orders WHERE order_number = ?', [orderNumber]);
  if (!o || (!admin && o.user_id !== userId)) throw new HttpError(404, 'Order not found');
  const [items, history, shipments, invoices, fb] = await Promise.all([
    query(`SELECT i.*, u.original_name AS artwork_name, v.reference AS vendor_reference, v.toptex_order_id
           FROM order_items i LEFT JOIN uploads u ON u.id = i.artwork_upload_id LEFT JOIN vendor_orders v ON v.id = i.vendor_order_id
           WHERE i.order_id = ? ORDER BY i.id`, [o.id]),
    query('SELECT status, note, created_at FROM order_status_history WHERE order_id = ? ORDER BY id', [o.id]),
    query('SELECT * FROM shipments WHERE order_id = ? ORDER BY id', [o.id]),
    query('SELECT invoice_number, shipment_id, grand_total, issued_at FROM invoices WHERE order_id = ? ORDER BY id', [o.id]),
    one('SELECT rating, comment, created_at FROM feedback WHERE order_id = ?', [o.id]),
  ]);
  const events = shipments.length
    ? await query(`SELECT * FROM shipment_events WHERE shipment_id IN (${shipments.map(() => '?').join(',')}) ORDER BY occurred_at DESC, id DESC`, shipments.map((s) => s.id))
    : [];
  return {
    orderNumber: o.order_number,
    fulfilmentType: o.fulfilment_type,
    status: o.status,
    statusLabel: STATUS_LABEL[o.status],
    paymentStatus: o.payment_status,
    flow: FLOW[o.fulfilment_type],
    nextActions: admin ? nextActions(o) : undefined,
    userId: admin ? o.user_id : undefined,
    adminNotes: admin ? o.admin_notes || '' : undefined,
    updatedAt: admin ? o.updated_at : undefined,
    createdAt: o.created_at,
    contact: { name: o.contact_name, email: o.contact_email, phone: o.contact_phone, company: o.company },
    shipTo: { street1: o.ship_street1, street2: o.ship_street2, postCode: o.ship_post_code, city: o.ship_city, country: o.ship_country },
    shippingMethod: o.shipping_method,
    shippingZone: o.shipping_zone,
    weightKg: money(o.weight_kg),
    totals: { goods: money(o.goods_total), marking: money(o.marking_total), shipping: money(o.shipping_cost), taxRate: money(o.tax_rate), tax: money(o.tax_total), grand: money(o.grand_total), currency: o.currency },
    notes: o.notes,
    items: items.map((i) => ({
      id: i.id, sku: i.sku, ref: i.catalog_ref, slug: i.product_slug, name: i.product_name, brand: i.brand, color: i.color, size: i.size,
      image: i.image_url, qty: i.quantity, unitPrice: money(i.unit_price), goodsTotal: money(i.goods_total), markingTotal: money(i.marking_total),
      customisation: i.customisation_type ? { type: i.customisation_type, placements: json(i.placements, []), artwork: i.artwork_name, artworkId: i.artwork_upload_id, design: json(i.design_spec, null) } : null,
      vendorStatus: i.vendor_status, customisationStatus: i.customisation_status,
      ...(admin ? { vendorReference: i.vendor_reference, toptexOrderId: i.toptex_order_id } : {}),
    })),
    history: history.map((h) => ({ status: h.status, label: STATUS_LABEL[h.status] || h.status, note: h.note, at: h.created_at })),
    shipments: shipments.map((s) => ({
      id: s.id, source: s.source, carrier: s.carrier, service: s.service, trackingNumber: s.tracking_number,
      trackingUrl: s.tracking_url, labelUrl: admin ? s.label_url : undefined, status: s.status, createdAt: s.created_at, deliveredAt: s.delivered_at,
      events: events.filter((e) => e.shipment_id === s.id).map((e) => ({ status: e.status, description: e.description, location: e.location, at: e.occurred_at })),
    })),
    invoices: invoices.map((v) => ({ number: v.invoice_number, total: money(v.grand_total), issuedAt: v.issued_at })),
    feedback: fb,
  };
}

function nextActions(o) {
  const acts = [...(MANUAL[o.status] || []).map((s) => ({ action: 'status', status: s, label: `Mark: ${STATUS_LABEL[s]}` }))];
  if (o.fulfilment_type === 'customised' && o.status === 'ready_to_ship') acts.push({ action: 'ship', label: 'Create shipment' });
  if (o.fulfilment_type === 'direct' && o.status === 'materials_ordered') acts.push({ action: 'ship', label: 'Record supplier delivery (tracking)' });
  if (CANCELLABLE.includes(o.status)) acts.push({ action: 'status', status: 'cancelled', label: 'Cancel order' });
  return acts;
}

export async function listOrders({ userId, status, q, limit = 100 } = {}) {
  const where = [], params = [];
  if (userId) { where.push('o.user_id = ?'); params.push(userId); }
  if (status) { where.push('o.status = ?'); params.push(status); }
  if (q) { where.push('(o.order_number LIKE ? OR o.contact_name LIKE ? OR o.contact_email LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const rows = await query(
    `SELECT o.order_number, o.status, o.fulfilment_type, o.grand_total, o.currency, o.created_at, o.contact_name, o.ship_city, o.ship_country,
            (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id) AS units,
            (SELECT COUNT(*) FROM order_items WHERE order_id = o.id AND vendor_status = 'pending') AS pending_vendor
     FROM orders o ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY o.id DESC LIMIT ?`,
    [...params, limit]
  );
  return rows.map((r) => ({
    orderNumber: r.order_number, status: r.status, statusLabel: STATUS_LABEL[r.status], fulfilmentType: r.fulfilment_type,
    total: Number(r.grand_total), currency: r.currency, createdAt: r.created_at, customer: r.contact_name,
    destination: `${r.ship_city}, ${r.ship_country}`, units: Number(r.units || 0), pendingVendorItems: Number(r.pending_vendor || 0),
  }));
}

// ------------------------------------------------------------------ admin actions
/**
 * Changes an order's status. Normally only the next manual step (or cancel) is allowed; with
 * `force` the admin can set any status (correcting mistakes, offline work). A forced change only
 * moves the status — it does not place supplier orders or create shipments.
 */
export async function adminSetStatus(orderNumber, status, note, { force = false } = {}) {
  if (!STATUS_LABEL[status]) throw new HttpError(400, 'Unknown status');
  const o = await one('SELECT * FROM orders WHERE order_number = ?', [orderNumber]);
  if (!o) throw new HttpError(404, 'Order not found');
  if (o.status === status) throw new HttpError(409, `Order is already "${STATUS_LABEL[status]}"`);
  const normal = (MANUAL[o.status] || []).includes(status) || (status === 'cancelled' && CANCELLABLE.includes(o.status));
  if (!normal && !force) throw new HttpError(409, `Cannot move order from "${o.status}" to "${status}"`);
  if (status !== 'cancelled' && !FLOW[o.fulfilment_type].includes(status)) {
    throw new HttpError(409, `"${STATUS_LABEL[status]}" is not a step for direct-delivery orders`);
  }
  const text = String(note || '').trim().slice(0, 255) || (normal ? null : 'Status set manually by admin');
  await tx(async (db) => {
    if (status === 'ready_to_ship') await db.query("UPDATE order_items SET customisation_status = 'done' WHERE order_id = ? AND customisation_status = 'pending'", [o.id]);
    await setStatus(db, o.id, status, text);
  });
  return getOrderDetail(orderNumber, { admin: true });
}

/** Same status for many orders; each order succeeds or fails on its own. */
export async function bulkSetStatus(orderNumbers, status, note) {
  if (!Array.isArray(orderNumbers) || !orderNumbers.length) throw new HttpError(400, 'Select at least one order');
  if (orderNumbers.length > 500) throw new HttpError(400, 'Up to 500 orders at a time');
  const updated = [], failed = [];
  for (const n of orderNumbers) {
    try { await adminSetStatus(String(n), status, note, { force: true }); updated.push(n); } catch (e) { failed.push({ orderNumber: n, error: e.message }); }
  }
  return { updated, failed };
}

export async function bulkSetPayment(orderNumbers, status) {
  if (!['unpaid', 'paid', 'refunded'].includes(status)) throw new HttpError(400, 'Invalid payment status');
  if (!Array.isArray(orderNumbers) || !orderNumbers.length) throw new HttpError(400, 'Select at least one order');
  const r = await query('UPDATE orders SET payment_status = ? WHERE order_number IN (?)', [status, orderNumbers.map(String)]);
  return { updated: r.affectedRows };
}

const EDITABLE = {
  contactName: ['contact_name', true, 120], contactEmail: ['contact_email', true, 190], contactPhone: ['contact_phone', true, 40],
  company: ['company', false, 120], street1: ['ship_street1', true, 190], street2: ['ship_street2', false, 190],
  postCode: ['ship_post_code', true, 20], city: ['ship_city', true, 120], country: ['ship_country', true, 2],
  notes: ['notes', false, 2000], adminNotes: ['admin_notes', false, 4000],
};

/** Admin edits contact, delivery address, customer notes and internal notes. Totals are not recalculated. */
export async function adminUpdateOrder(orderNumber, body = {}) {
  const o = await one('SELECT id, status FROM orders WHERE order_number = ?', [orderNumber]);
  if (!o) throw new HttpError(404, 'Order not found');
  const sets = [], params = [];
  for (const [key, [col, req, max]] of Object.entries(EDITABLE)) {
    if (body[key] === undefined) continue;
    let v = String(body[key] ?? '').trim().slice(0, max);
    if (key === 'country') v = v.toUpperCase();
    if (key === 'contactEmail' && v && !/^\S+@\S+\.\S+$/.test(v)) throw new HttpError(400, 'Enter a valid email');
    if (req && !v) throw new HttpError(400, `${key} cannot be empty`);
    sets.push(`${col} = ?`); params.push(v || null);
  }
  if (!sets.length) throw new HttpError(400, 'Nothing to update');
  await query(`UPDATE orders SET ${sets.join(', ')}, updated_at = ${NOW} WHERE id = ?`, [...params, o.id]);
  return getOrderDetail(orderNumber, { admin: true });
}

// ------------------------------------------------------------------ admin list with filters
const SORTS = {
  newest: 'o.id DESC', oldest: 'o.id ASC', total_desc: 'o.grand_total DESC, o.id DESC', total_asc: 'o.grand_total ASC, o.id DESC',
};
const nextDay = (d) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));

/**
 * Filters: q (order no. / name / email / phone / city), status, payment, type (customised|direct),
 * supplier (to_order | ordered | received), country, user (id), po (supplier order reference), from / to (YYYY-MM-DD).
 * Returns one page plus per-status counts for the same filters (ignoring status) and the filtered total value.
 */
export async function adminListOrders(f = {}) {
  const where = [], params = [];
  if (f.q) {
    const like = `%${String(f.q).trim()}%`;
    where.push('(o.order_number LIKE ? OR o.contact_name LIKE ? OR o.contact_email LIKE ? OR o.contact_phone LIKE ? OR o.company LIKE ? OR o.ship_city LIKE ?)');
    params.push(like, like, like, like, like, like);
  }
  if (['unpaid', 'paid', 'refunded'].includes(f.payment)) { where.push('o.payment_status = ?'); params.push(f.payment); }
  if (['customised', 'direct'].includes(f.type)) { where.push('o.fulfilment_type = ?'); params.push(f.type); }
  if (f.supplier === 'to_order') where.push("EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND i.vendor_status = 'pending') AND o.status <> 'cancelled'");
  if (f.supplier === 'ordered') where.push("EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND i.vendor_status = 'ordered')");
  if (f.supplier === 'received') where.push("NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND i.vendor_status <> 'received')");
  if (f.country) { where.push('o.ship_country = ?'); params.push(String(f.country).toUpperCase().slice(0, 2)); }
  if (f.user) { where.push('o.user_id = ?'); params.push(Number(f.user)); }
  if (f.po) { where.push('EXISTS (SELECT 1 FROM order_items i JOIN vendor_orders v ON v.id = i.vendor_order_id WHERE i.order_id = o.id AND v.reference = ?)'); params.push(String(f.po)); }
  if (isDate(f.from)) { where.push('o.created_at >= ?'); params.push(f.from); }
  if (isDate(f.to)) { where.push('o.created_at < ?'); params.push(nextDay(f.to)); }

  const base = where.join(' AND ');
  const withStatus = STATUS_LABEL[f.status] ? [base, 'o.status = ?'].filter(Boolean).join(' AND ') : base;
  const wParams = STATUS_LABEL[f.status] ? [...params, f.status] : params;
  const W = (w) => (w ? `WHERE ${w}` : '');

  const size = Math.min(200, Math.max(1, parseInt(f.pageSize, 10) || 50));
  const page = Math.max(1, parseInt(f.page, 10) || 1);
  const [agg] = await query(`SELECT COUNT(*) AS n, SUM(o.grand_total) AS value FROM orders o ${W(withStatus)}`, wParams);
  const byStatus = await query(`SELECT o.status, COUNT(*) AS n FROM orders o ${W(base)} GROUP BY o.status`, params);
  const rows = await query(
    `SELECT o.id, o.user_id, o.order_number, o.status, o.payment_status, o.fulfilment_type, o.grand_total, o.currency, o.created_at,
            o.contact_name, o.contact_email, o.company, o.ship_city, o.ship_country, o.admin_notes,
            (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id) AS units,
            (SELECT COUNT(*) FROM order_items WHERE order_id = o.id AND vendor_status = 'pending') AS v_pending,
            (SELECT COUNT(*) FROM order_items WHERE order_id = o.id AND vendor_status = 'ordered') AS v_ordered,
            (SELECT COUNT(*) FROM order_items WHERE order_id = o.id AND vendor_status = 'received') AS v_received,
            (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS v_total
     FROM orders o ${W(withStatus)} ORDER BY ${SORTS[f.sort] || SORTS.newest} LIMIT ? OFFSET ?`,
    [...wParams, size, (page - 1) * size]
  );
  // Customisation summary per order (technique, print locations, garments designed in the studio).
  const custom = new Map();
  if (rows.length) {
    const its = await query(
      'SELECT order_id, customisation_type, placements, design_spec, quantity FROM order_items WHERE order_id IN (?) AND customisation_type IS NOT NULL',
      [rows.map((r) => r.id)]
    );
    for (const i of its) {
      const c = custom.get(i.order_id) || { types: new Set(), locations: new Set(), garments: new Set(), units: 0, designs: new Set() };
      c.types.add(i.customisation_type);
      json(i.placements, []).forEach((p) => c.locations.add(p));
      const d = json(i.design_spec, null);
      if (d?.garment) c.garments.add(d.garment);
      if (d) c.designs.add(JSON.stringify(d.items));
      c.units += Number(i.quantity || 0);
      custom.set(i.order_id, c);
    }
  }
  const summary = (id) => {
    const c = custom.get(id);
    return c ? { types: [...c.types], locations: [...c.locations], garments: [...c.garments], units: c.units, designs: c.designs.size } : null;
  };
  return {
    items: rows.map((r) => ({
      orderNumber: r.order_number, userId: r.user_id, status: r.status, statusLabel: STATUS_LABEL[r.status], paymentStatus: r.payment_status,
      fulfilmentType: r.fulfilment_type, total: Number(r.grand_total), currency: r.currency, createdAt: r.created_at,
      customer: r.contact_name, email: r.contact_email, company: r.company, destination: `${r.ship_city}, ${r.ship_country}`,
      units: Number(r.units || 0), hasAdminNotes: !!r.admin_notes, customisation: summary(r.id),
      supplier: { pending: Number(r.v_pending || 0), ordered: Number(r.v_ordered || 0), received: Number(r.v_received || 0), total: Number(r.v_total || 0) },
    })),
    total: Number(agg?.n || 0), value: Number(agg?.value || 0), page, pageSize: size,
    statusCounts: Object.fromEntries(byStatus.map((r) => [r.status, Number(r.n)])),
  };
}

/** Countries that appear on orders, for the filter dropdown. */
export async function orderCountries() {
  return (await query('SELECT DISTINCT ship_country AS c FROM orders ORDER BY ship_country')).map((r) => r.c);
}

/**
 * Creates a shipment.
 * - customised orders: booked with our delivery partner from the workshop.
 * - direct orders: TopTex ships to the customer; the admin records the carrier + tracking
 *   number from the TopTex delivery (GET /v3/deliveries) — `source: 'toptex'`.
 * The invoice for the shipment is generated at the same time, with the address snapshot.
 */
export async function createShipment(orderNumber, body = {}) {
  const o = await one('SELECT * FROM orders WHERE order_number = ?', [orderNumber]);
  if (!o) throw new HttpError(404, 'Order not found');
  const allowed = o.fulfilment_type === 'customised' ? o.status === 'ready_to_ship' : o.status === 'materials_ordered';
  if (!allowed) throw new HttpError(409, `Order is "${o.status}" — it cannot be shipped yet`);

  let s;
  if (body.trackingNumber) {
    s = { source: o.fulfilment_type === 'direct' ? 'toptex' : 'manual', carrier: body.carrier || 'Carrier', service: body.service || null, trackingNumber: body.trackingNumber, trackingUrl: body.trackingUrl || null, labelUrl: null };
  } else {
    if (o.fulfilment_type === 'direct') throw new HttpError(400, 'Enter the carrier and tracking number from the TopTex delivery');
    const r = await partnerCreateShipment({ order: o, weightKg: Number(o.weight_kg) });
    s = { source: 'partner', ...r, trackingUrl: trackingUrl(r.trackingNumber) };
  }

  const shipmentId = await tx(async (db) => {
    const r = await db.query(
      'INSERT INTO shipments (order_id, source, carrier, service, tracking_number, tracking_url, label_url, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [o.id, s.source, s.carrier, s.service, s.trackingNumber, s.trackingUrl, s.labelUrl, o.shipping_cost]
    );
    await db.query(`INSERT INTO shipment_events (shipment_id, status, description, location, occurred_at) VALUES (?, ?, ?, ?, ${NOW})`,
      [r.insertId, 'created', o.fulfilment_type === 'direct' ? 'Dispatched by supplier' : 'Parcel handed to delivery partner', o.fulfilment_type === 'direct' ? 'Supplier warehouse' : config.workshop.city]);
    await setStatus(db, o.id, 'shipped', s.trackingNumber ? `${s.carrier} ${s.trackingNumber}` : null);
    await createInvoice(db, o, r.insertId);
    return r.insertId;
  });
  return { shipmentId, order: await getOrderDetail(orderNumber, { admin: true }) };
}

const SHIP_STATUSES = ['in_transit', 'out_for_delivery', 'delivered', 'exception'];
const SHIP_LABEL = { in_transit: 'In transit', out_for_delivery: 'Out for delivery', delivered: 'Delivered', exception: 'Delivery problem — our team is on it' };

export async function addShipmentEvent(shipmentId, { status, description, location }) {
  if (!SHIP_STATUSES.includes(status)) throw new HttpError(400, `status must be one of ${SHIP_STATUSES.join(', ')}`);
  const s = await one('SELECT s.*, o.order_number, o.status AS order_status FROM shipments s JOIN orders o ON o.id = s.order_id WHERE s.id = ?', [shipmentId]);
  if (!s) throw new HttpError(404, 'Shipment not found');
  await tx(async (db) => {
    await db.query(`INSERT INTO shipment_events (shipment_id, status, description, location, occurred_at) VALUES (?, ?, ?, ?, ${NOW})`,
      [shipmentId, status, description || SHIP_LABEL[status], location || null]);
    await db.query(`UPDATE shipments SET status = ?${status === 'delivered' ? `, delivered_at = ${NOW}` : ''} WHERE id = ?`, [status, shipmentId]);
    if (status === 'delivered' && s.order_status === 'shipped') await setStatus(db, s.order_id, 'delivered');
  });
  return getOrderDetail(s.order_number, { admin: true });
}

/** Pulls status history from the delivery partner (no-op for the flat-rate provider). */
export async function refreshTracking(shipmentId) {
  const s = await one('SELECT s.*, o.order_number FROM shipments s JOIN orders o ON o.id = s.order_id WHERE s.id = ?', [shipmentId]);
  if (!s) throw new HttpError(404, 'Shipment not found');
  if (s.source !== 'partner') return { updated: 0 };
  const events = await trackShipment(s);
  if (!events?.length) return { updated: 0 };
  const known = await query('SELECT status, occurred_at FROM shipment_events WHERE shipment_id = ?', [shipmentId]);
  const seen = new Set(known.map((k) => `${k.status}|${new Date(k.occurred_at).toISOString()}`));
  let n = 0;
  for (const e of events) {
    const at = new Date(e.occurredAt);
    if (seen.has(`${e.status}|${at.toISOString()}`)) continue;
    await addShipmentEvent(shipmentId, { status: SHIP_STATUSES.includes(e.status) ? e.status : 'in_transit', description: e.description, location: e.location });
    n++;
  }
  return { updated: n };
}

// ------------------------------------------------------------------ invoices
async function createInvoice(db, o, shipmentId) {
  const exists = await db.one('SELECT id FROM invoices WHERE order_id = ?', [o.id]);
  if (exists) return; // one invoice per order: the first shipment carries it
  const items = await db.query('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [o.id]);
  const u = await db.one('SELECT name, email FROM users WHERE id = ?', [o.user_id]);
  const addr = { name: o.contact_name, company: o.company, street1: o.ship_street1, street2: o.ship_street2, postCode: o.ship_post_code, city: o.ship_city, country: o.ship_country, phone: o.contact_phone, email: o.contact_email };
  const lines = items.flatMap((i) => {
    const out = [{ description: `${i.brand} ${i.product_name} — ${i.color}, ${i.size} (${i.sku})`, qty: i.quantity, unit: Number(i.unit_price), total: Number(i.goods_total) }];
    if (Number(i.marking_total)) out.push({ description: `${i.customisation_type}: ${json(i.placements, []).map(placementLabel).join(', ')}`, qty: 1, unit: Number(i.marking_total), total: Number(i.marking_total) });
    return out;
  });
  lines.push({ description: `Shipping — ${o.shipping_method}`, qty: 1, unit: Number(o.shipping_cost), total: Number(o.shipping_cost) });
  const r = await db.query(
    `INSERT INTO invoices (invoice_number, order_id, shipment_id, bill_to, ship_to, line_items, goods_total, marking_total, shipping_cost, tax_rate, tax_total, grand_total, currency)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [tempNumber(), o.id, shipmentId, JSON.stringify({ ...addr, name: u?.name || o.contact_name, email: u?.email || o.contact_email }), JSON.stringify(addr), JSON.stringify(lines),
      o.goods_total, o.marking_total, o.shipping_cost, o.tax_rate, o.tax_total, o.grand_total, o.currency]
  );
  await db.query('UPDATE invoices SET invoice_number = ? WHERE id = ?', [docNumber('INV', r.insertId, 6, 'y'), r.insertId]);
}

export async function getInvoice(number, { userId, admin }) {
  const v = await one('SELECT v.*, o.order_number, o.user_id, o.created_at AS order_date FROM invoices v JOIN orders o ON o.id = v.order_id WHERE v.invoice_number = ?', [number]);
  if (!v || (!admin && v.user_id !== userId)) throw new HttpError(404, 'Invoice not found');
  return {
    number: v.invoice_number, orderNumber: v.order_number, orderDate: v.order_date, issuedAt: v.issued_at,
    seller: config.company, billTo: json(v.bill_to), shipTo: json(v.ship_to), lines: json(v.line_items, []),
    totals: { goods: Number(v.goods_total), marking: Number(v.marking_total), shipping: Number(v.shipping_cost), taxRate: Number(v.tax_rate), tax: Number(v.tax_total), grand: Number(v.grand_total), currency: v.currency },
  };
}

// ------------------------------------------------------------------ feedback
export async function leaveFeedback(user, orderNumber, { rating, comment }) {
  const o = await one('SELECT id, user_id, status FROM orders WHERE order_number = ?', [orderNumber]);
  if (!o || o.user_id !== user.id) throw new HttpError(404, 'Order not found');
  if (o.status !== 'delivered') throw new HttpError(409, 'Feedback opens once the order is delivered');
  const r = parseInt(rating, 10);
  if (!(r >= 1 && r <= 5)) throw new HttpError(400, 'Rating must be 1–5');
  const text = String(comment || '').slice(0, 2000) || null;
  if (await one('SELECT id FROM feedback WHERE order_id = ?', [o.id])) await query('UPDATE feedback SET rating = ?, comment = ? WHERE order_id = ?', [r, text, o.id]);
  else await query('INSERT INTO feedback (order_id, user_id, rating, comment) VALUES (?, ?, ?, ?)', [o.id, user.id, r, text]);
  return { ok: true };
}

export async function listFeedback() {
  const rows = await query(`SELECT f.rating, f.comment, f.created_at, o.order_number, u.name FROM feedback f
    JOIN orders o ON o.id = f.order_id JOIN users u ON u.id = f.user_id ORDER BY f.id DESC LIMIT 200`);
  const avg = rows.length ? rows.reduce((n, r) => n + r.rating, 0) / rows.length : null;
  return { average: avg && Math.round(avg * 10) / 10, count: rows.length, items: rows.map((r) => ({ rating: r.rating, comment: r.comment, at: r.created_at, orderNumber: r.order_number, customer: r.name })) };
}
