// Purchase orders to TopTex.
//  - immediate: one TopTex order per customer order, sent when the customer checks out.
//  - grouped:   the admin picks pending items from many customer orders; quantities are summed
//               per SKU into one TopTex order, and every order item keeps a link to it.
// Direct (non-customised) orders are delivered by TopTex to the customer with a neutral delivery note.
import { query, one, tx, NOW, docNumber, tempNumber } from '../db.js';
import { config, toptexConfigured } from '../config.js';
import { HttpError } from '../lib/http.js';
import { toptex } from './TopTexService.js';
import { setStatus } from './orders.service.js';

const pickId = (r) => r && (r.orderId ?? r.order_id ?? r.id ?? r.orderNumber ?? r.order_number ?? r.reference ?? null);

export async function placeVendorOrder({ itemIds, mode, userId = null, express = false }) {
  if (!itemIds?.length) throw new HttpError(400, 'Select at least one item');
  const items = await query(
    `SELECT i.*, o.order_number, o.fulfilment_type, o.contact_name, o.contact_phone, o.contact_email, o.company,
            o.ship_street1, o.ship_street2, o.ship_post_code, o.ship_city, o.ship_country, o.status AS order_status
     FROM order_items i JOIN orders o ON o.id = i.order_id WHERE i.id IN (?)`, [itemIds]);
  if (items.length !== itemIds.length) throw new HttpError(404, 'Some items were not found');
  if (items.some((i) => i.vendor_status !== 'pending')) throw new HttpError(409, 'Some items were already ordered from the supplier');
  if (items.some((i) => i.order_status === 'cancelled')) throw new HttpError(409, 'Some items belong to cancelled orders');

  const direct = items.some((i) => i.fulfilment_type === 'direct');
  const orderIds = [...new Set(items.map((i) => i.order_id))];
  if (direct && orderIds.length > 1) throw new HttpError(400, 'Direct-delivery orders ship to the customer and cannot be grouped with other orders');

  const first = items[0];
  const deliveryAddress = direct
    ? {
        addressTitle: first.company || first.contact_name, street1: first.ship_street1, street2: first.ship_street2 || '',
        postCode: first.ship_post_code, city: first.ship_city, country: first.ship_country.toLowerCase(),
        contactName: first.contact_name, contactPhone: first.contact_phone, contactEmail: first.contact_email,
      }
    : { ...config.workshop };

  // Sum quantities per SKU; the comment keeps the customer order numbers for the packing list.
  const bySku = new Map();
  for (const i of items) {
    const l = bySku.get(i.sku) || { sku: i.sku, quantity: 0, orders: new Set() };
    l.quantity += i.quantity;
    l.orders.add(i.order_number);
    bySku.set(i.sku, l);
  }
  const lines = [...bySku.values()].map((l) => ({ sku: l.sku, quantity: l.quantity, comment: [...l.orders].join(' ') }));

  const dryRun = !toptexConfigured();
  const voId = await tx(async (db) => {
    const r = await db.query(
      `INSERT INTO vendor_orders (reference, mode, deliver_to, status, dry_run, created_by) VALUES (?, ?, ?, 'placed', ?, ?)`,
      [tempNumber(), mode, direct ? 'customer' : 'workshop', dryRun ? 1 : 0, userId]
    );
    await db.query('UPDATE vendor_orders SET reference = ? WHERE id = ?', [docNumber('PO', r.insertId, 4), r.insertId]);
    for (const l of lines) await db.query('INSERT INTO vendor_order_lines (vendor_order_id, sku, quantity) VALUES (?, ?, ?)', [r.insertId, l.sku, l.quantity]);
    return r.insertId;
  });
  const { reference } = await one('SELECT reference FROM vendor_orders WHERE id = ?', [voId]);

  const payload = toptex.buildOrderPayload({
    reference, deliveryAddress, lines, express, neutralDeliveryNote: direct,
    comment: direct ? `Direct delivery for ${first.order_number}` : `Orders ${orderIds.length}`,
  });

  let response = null, error = null, toptexId = null;
  if (dryRun) {
    response = { dryRun: true, note: 'TopTex credentials not configured — order recorded locally only' };
    toptexId = `DRYRUN-${reference}`;
  } else {
    try {
      response = await toptex.createOrder(payload);
      toptexId = pickId(response) ? String(pickId(response)) : null;
    } catch (e) {
      error = e.message;
      response = e.body ?? null;
    }
  }

  await tx(async (db) => {
    await db.query('UPDATE vendor_orders SET status = ?, toptex_order_id = ?, request_json = ?, response_json = ?, error = ? WHERE id = ?',
      [error ? 'failed' : 'placed', toptexId, JSON.stringify(payload), JSON.stringify(response), error, voId]);
    if (error) return;
    await db.query("UPDATE order_items SET vendor_status = 'ordered', vendor_order_id = ? WHERE id IN (?)", [voId, itemIds]);
    for (const oid of orderIds) {
      const left = await db.one("SELECT COUNT(*) AS n FROM order_items WHERE order_id = ? AND vendor_status = 'pending'", [oid]);
      const o = await db.one('SELECT status FROM orders WHERE id = ?', [oid]);
      if (Number(left.n) === 0 && o.status === 'placed') await setStatus(db, oid, 'materials_ordered', `Supplier order ${reference}`);
    }
  });
  if (error) throw new HttpError(502, `TopTex rejected the order: ${error}`, response);
  return getVendorOrder(voId);
}

/**
 * Admin → Orders: the admin ticks customer orders and groups their garments into one TopTex order.
 * Works out which items can go on the order (customised, not yet ordered, order not cancelled),
 * sums quantities per SKU, and explains every order that is left out.
 */
export async function groupPreview(orderNumbers) {
  if (!Array.isArray(orderNumbers) || !orderNumbers.length) throw new HttpError(400, 'Select at least one order');
  const nums = [...new Set(orderNumbers.map(String))];
  const orders = await query('SELECT id, order_number, status, fulfilment_type FROM orders WHERE order_number IN (?)', [nums]);
  const items = orders.length
    ? await query(
      `SELECT i.id, i.order_id, i.sku, i.catalog_ref, i.product_name, i.brand, i.color, i.size, i.image_url, i.quantity, i.vendor_status
       FROM order_items i WHERE i.order_id IN (?) ORDER BY i.order_id, i.id`, [orders.map((o) => o.id)])
    : [];

  const skipped = nums.filter((n) => !orders.some((o) => o.order_number === n)).map((n) => ({ orderNumber: n, reason: 'Order not found' }));
  const included = [], itemIds = [];
  const bySku = new Map();
  for (const o of orders) {
    const mine = items.filter((i) => i.order_id === o.id);
    const pending = mine.filter((i) => i.vendor_status === 'pending');
    let reason = null;
    if (o.status === 'cancelled') reason = 'Cancelled';
    else if (!pending.length) reason = 'Garments already ordered';
    else if (o.fulfilment_type === 'direct') reason = 'Direct delivery — TopTex ships it to the customer on its own order (resend from Supplier orders)';
    if (reason) { skipped.push({ orderNumber: o.order_number, reason }); continue; }
    included.push({ orderNumber: o.order_number, items: pending.length, units: pending.reduce((n, i) => n + i.quantity, 0) });
    for (const i of pending) {
      itemIds.push(i.id);
      const s = bySku.get(i.sku) || { sku: i.sku, ref: i.catalog_ref, name: `${i.brand} ${i.product_name}`, color: i.color, size: i.size, image: i.image_url, qty: 0, orders: [] };
      s.qty += i.quantity;
      s.orders.push({ orderNumber: o.order_number, qty: i.quantity });
      bySku.set(i.sku, s);
    }
  }
  const lines = [...bySku.values()].sort((a, b) => a.ref.localeCompare(b.ref) || a.color.localeCompare(b.color) || a.sku.localeCompare(b.sku));
  return {
    dryRun: !toptexConfigured(), itemIds, included, skipped, lines,
    totals: { orders: included.length, skus: lines.length, units: lines.reduce((n, l) => n + l.qty, 0) },
  };
}

export async function placeGroupedFromOrders({ orderNumbers, userId, express = false }) {
  const p = await groupPreview(orderNumbers);
  if (!p.itemIds.length) throw new HttpError(409, 'None of the selected orders has garments waiting to be ordered');
  const vo = await placeVendorOrder({ itemIds: p.itemIds, mode: 'grouped', userId, express });
  return { ...vo, skipped: p.skipped };
}

/** Customised items waiting to be ordered, with a per-SKU summary for grouping. */
export async function pendingItems() {
  const rows = await query(
    `SELECT i.id, i.sku, i.catalog_ref, i.product_name, i.brand, i.color, i.size, i.quantity, i.customisation_type,
            o.order_number, o.fulfilment_type, o.created_at
     FROM order_items i JOIN orders o ON o.id = i.order_id
     WHERE i.vendor_status = 'pending' AND o.status <> 'cancelled' ORDER BY o.id, i.id`);
  const items = rows.map((r) => ({
    id: r.id, sku: r.sku, ref: r.catalog_ref, name: r.product_name, brand: r.brand, color: r.color, size: r.size, qty: r.quantity,
    customisation: r.customisation_type, orderNumber: r.order_number, fulfilmentType: r.fulfilment_type, orderedAt: r.created_at,
  }));
  const bySku = new Map();
  for (const i of items.filter((x) => x.fulfilmentType === 'customised')) {
    const s = bySku.get(i.sku) || { sku: i.sku, name: `${i.brand} ${i.name}`, color: i.color, size: i.size, qty: 0, orders: [] };
    s.qty += i.qty;
    s.orders.push(i.orderNumber);
    bySku.set(i.sku, s);
  }
  return { mode: config.vendorOrderMode, dryRun: !toptexConfigured(), items, bySku: [...bySku.values()] };
}

export async function listVendorOrders() {
  const rows = await query(
    `SELECT v.*, (SELECT SUM(quantity) FROM vendor_order_lines WHERE vendor_order_id = v.id) AS units
     FROM vendor_orders v ORDER BY v.id DESC LIMIT 200`);
  const orders = await ordersByVendorOrder(rows.map((r) => r.id));
  return rows.map((v) => voView({ ...v, orders: orders.get(v.id) }));
}

// Customer order numbers covered by each supplier order (portable alternative to GROUP_CONCAT).
async function ordersByVendorOrder(ids) {
  const map = new Map();
  if (!ids.length) return map;
  const rows = await query(
    `SELECT DISTINCT i.vendor_order_id AS vo, o.id, o.order_number FROM order_items i JOIN orders o ON o.id = i.order_id
     WHERE i.vendor_order_id IN (?) ORDER BY o.id`, [ids]);
  for (const r of rows) map.set(r.vo, [...(map.get(r.vo) || []), r.order_number]);
  return map;
}

const voView = (v) => ({
  id: v.id, reference: v.reference, toptexOrderId: v.toptex_order_id, mode: v.mode, deliverTo: v.deliver_to, status: v.status,
  dryRun: !!v.dry_run, error: v.error, placedAt: v.placed_at, receivedAt: v.received_at, units: Number(v.units || 0),
  orders: v.orders || [],
});

export async function getVendorOrder(id) {
  const v = await one(
    `SELECT v.*, (SELECT SUM(quantity) FROM vendor_order_lines WHERE vendor_order_id = v.id) AS units
     FROM vendor_orders v WHERE v.id = ?`, [id]);
  if (!v) throw new HttpError(404, 'Supplier order not found');
  const lines = await query('SELECT sku, quantity FROM vendor_order_lines WHERE vendor_order_id = ?', [id]);
  const orders = await ordersByVendorOrder([v.id]);
  return { ...voView({ ...v, orders: orders.get(v.id) }), lines };
}

/** Goods arrived at the workshop: items become 'received'; complete customer orders move on. */
export async function markReceived(id) {
  const v = await one('SELECT * FROM vendor_orders WHERE id = ?', [id]);
  if (!v) throw new HttpError(404, 'Supplier order not found');
  if (v.deliver_to === 'customer') throw new HttpError(409, 'This supplier order is delivered straight to the customer');
  if (v.status !== 'placed') throw new HttpError(409, `Supplier order is ${v.status}`);
  await tx(async (db) => {
    await db.query(`UPDATE vendor_orders SET status = 'received', received_at = ${NOW} WHERE id = ?`, [id]);
    await db.query("UPDATE order_items SET vendor_status = 'received' WHERE vendor_order_id = ?", [id]);
    const orders = await db.query('SELECT DISTINCT order_id FROM order_items WHERE vendor_order_id = ?', [id]);
    for (const { order_id } of orders) {
      const left = await db.one("SELECT COUNT(*) AS n FROM order_items WHERE order_id = ? AND vendor_status <> 'received'", [order_id]);
      const o = await db.one('SELECT status FROM orders WHERE id = ?', [order_id]);
      if (Number(left.n) === 0 && o.status === 'materials_ordered') await setStatus(db, order_id, 'materials_received', `Supplier order ${v.reference}`);
    }
  });
  return getVendorOrder(id);
}

/** Vendor-side delivery notes (tracking for direct orders). Returns [] in dry-run mode. */
export async function vendorDeliveries() {
  if (!toptexConfigured()) return { dryRun: true, items: [] };
  const body = await toptex.getDeliveries();
  return { dryRun: false, items: Array.isArray(body) ? body : body?.items || body?.deliveries || [] };
}
