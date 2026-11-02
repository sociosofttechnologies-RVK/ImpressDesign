// TopTex V3 API client (https://api.toptex.io).
// Authentication is two-factor: every call carries the static `x-api-key`, and a session token
// obtained from POST /v3/authenticate (username + password) is sent as `x-toptex-authorization`.
// The token is cached and refreshed automatically when it expires or a call returns 401/403.
import { config, toptexConfigured } from '../config.js';

const TOKEN_TTL_MS = 50 * 60 * 1000; // refresh before the session expires (TopTex tokens last ~1 h)

export class TopTexError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'TopTexError';
    this.status = status;
    this.body = body;
  }
}

export class TopTexService {
  constructor(opts = config.toptex) {
    this.opts = opts;
    this.token = null;
    this.tokenAt = 0;
    this.authPromise = null;
  }

  get configured() { return toptexConfigured(); }

  // ------------------------------------------------------------------ auth
  async authenticate(force = false) {
    if (!force && this.token && Date.now() - this.tokenAt < TOKEN_TTL_MS) return this.token;
    if (this.authPromise) return this.authPromise; // share one login between concurrent calls
    this.authPromise = (async () => {
      const res = await this.#fetch('/v3/authenticate', {
        method: 'POST',
        headers: { 'x-api-key': this.opts.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({ username: this.opts.username, password: this.opts.password }),
      });
      const body = await this.#parse(res);
      if (!res.ok || !body?.token) throw new TopTexError(`TopTex authentication failed (${res.status})`, res.status, body);
      this.token = body.token;
      this.tokenAt = Date.now();
      return this.token;
    })();
    try { return await this.authPromise; } finally { this.authPromise = null; }
  }

  // Every API call goes through here: adds both auth headers and retries once on an expired token.
  async request(path, opts = {}, retried = false) {
    // GETs are retried on rate limiting, server errors and network drops (TopTex sits behind AWS API Gateway).
    if ((opts.method || 'GET') === 'GET' && !opts.noRetry) {
      for (let attempt = 1; ; attempt++) {
        try {
          return await this.requestOnce(path, opts, retried);
        } catch (e) {
          const transient = e instanceof TopTexError && (e.status === 0 || e.status === 429 || e.status >= 500);
          if (!transient || attempt >= 4) throw e;
          await new Promise((r) => setTimeout(r, 1500 * 2 ** (attempt - 1)));
        }
      }
    }
    return this.requestOnce(path, opts, retried);
  }

  async requestOnce(path, { method = 'GET', query, body, headers = {}, raw = false } = {}, retried = false) {
    if (!this.configured) throw new TopTexError('TopTex credentials are not configured (TOPTEX_API_KEY / USERNAME / PASSWORD)', 0);
    const token = await this.authenticate();
    const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString() : '';
    const res = await this.#fetch(path + qs, {
      method,
      headers: {
        'x-api-key': this.opts.apiKey,
        'x-toptex-authorization': token,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if ((res.status === 401 || res.status === 403) && !retried) {
      await this.authenticate(true);
      return this.requestOnce(path, { method, query, body, headers, raw }, true);
    }
    if (raw) return res;
    const data = await this.#parse(res);
    if (!res.ok) throw new TopTexError(`TopTex ${method} ${path} failed (${res.status})`, res.status, data);
    return data;
  }

  // ------------------------------------------------------------------ catalog
  /** One page of the full catalog. TopTex paginates with page_number (1-based) and page_size. */
  getProductsPage(pageNumber = 1, pageSize = this.opts.pageSize, filters = {}) {
    return this.request('/v3/products/all', {
      query: { usage_right: this.opts.usageRight, page_number: pageNumber, page_size: pageSize, display_prices: 1, ...filters },
    });
  }

  /**
   * Walks the whole catalog. Items are handed to onPage(items, page, total) as they arrive and are
   * NOT accumulated here. TopTex runs on AWS Lambda: when a page's response is too large (>6 MB) or
   * too slow, it returns 200 with {errorMessage, errorType} instead of products. Re-asking for the
   * same page fails the same way, so the walk is tracked by item offset and the page size is halved
   * for that stretch (100 → 50 → 25 … → 1), then grown back once past it. An item that fails even
   * on its own is skipped and reported. Returns the number of items seen.
   */
  async getAllProducts({ pageSize = this.opts.pageSize, filters = {}, onPage, maxRequests = 5000, log = () => {} } = {}) {
    let seen = 0, offset = 0, total = null, size = pageSize, calls = 0, emptyStreak = 0, prevFirst = null;
    const unfetchable = [];
    const errorOf = (body) => body && typeof body === 'object' && !Array.isArray(body)
      ? body.errorMessage || body.errorType || body.message || body.error || null : null;

    while (calls++ < maxRequests) {
      const page = Math.floor(offset / size) + 1; // offset is always a multiple of size
      let body;
      try { body = await this.getProductsPage(page, size, filters); }
      catch (e) { if (!(e instanceof TopTexError) || e.status < 500) throw e; body = { errorMessage: e.message }; }
      const items = Array.isArray(body) ? body : body?.items || [];
      total = Number(body?.total_count) || total;
      const err = errorOf(body);
      const more = total ? offset < total : seen === 0;

      if (!items.length && more) {
        if (size > 1) {
          log(`items ${offset + 1}–${offset + size} failed (${err ? `TopTex: "${String(err).slice(0, 120)}"` : 'empty'}) — retrying in pages of ${Math.ceil(size / 2)}`);
          size = Math.ceil(size / 2);
          while (offset % size) size--; // keep page boundaries aligned with offset
          continue;
        }
        // A single product that TopTex cannot return: skip it rather than abandon the sync.
        if (++emptyStreak <= 2 && !err) { await new Promise((r) => setTimeout(r, 2000)); continue; }
        if (!total) break;
        unfetchable.push(offset + 1);
        log(`item ${offset + 1} cannot be fetched from TopTex — skipped${err ? ` ("${String(err).slice(0, 120)}")` : ''}`);
        offset += 1; emptyStreak = 0;
        if (unfetchable.length > 50) throw new Error(`TopTex failed on more than 50 individual products (last at item ${offset}) — stopping`);
        continue;
      }
      if (!items.length) break;
      emptyStreak = 0;

      const first = items[0]?.catalogReference;
      if (offset > 0 && first && first === prevFirst) throw new Error(`TopTex returned the same products again at item ${offset + 1} (${first}) — paging is not advancing`);
      prevFirst = first;
      seen += items.length;
      offset += items.length;
      await onPage?.(items, calls, total);
      if (total ? offset >= total : items.length < size) break;

      // Grow back towards the normal page size when the boundary allows it.
      for (let next = Math.min(size * 2, pageSize); size < pageSize && offset % next === 0; next = Math.min(size * 2, pageSize)) size = next;
    }
    if (total && seen + unfetchable.length < total) throw new Error(`TopTex stopped returning products: got ${seen} of ${total}`);
    if (unfetchable.length) log(`finished with ${unfetchable.length} product(s) TopTex could not return (items ${unfetchable.slice(0, 10).join(', ')}${unfetchable.length > 10 ? ' …' : ''})`);
    return seen;
  }

  getProductByReference(catalogReference) {
    return this.request('/v3/products', { query: { catalog_reference: catalogReference, usage_right: this.opts.usageRight } });
  }

  getAttributes(attributes = 'brand,family,subfamily') {
    return this.request('/v3/attributes', { query: { attributes } });
  }

  // ------------------------------------------------------------------ stock & price
  getInventoryBySku(sku) { return this.request(`/v3/products/${encodeURIComponent(sku)}/inventory`); }
  getInventoryByReference(catalogReference, color) { return this.request('/v3/products/inventory', { query: { catalog_reference: catalogReference, color } }); }
  getPriceBySku(sku) { return this.request(`/v3/products/${encodeURIComponent(sku)}/price`); }
  getPricesByReference(catalogReference) { return this.request('/v3/products/price', { query: { catalog_reference: catalogReference } }); }

  // ------------------------------------------------------------------ orders
  /**
   * Places a purchase order.
   * @param {object} o
   * @param {string} o.reference      our reference (myOrderId)
   * @param {object} o.deliveryAddress {addressTitle, street1, street2, postCode, city, country, contactName, contactPhone, contactEmail}
   * @param {{sku:string, quantity:number, comment?:string}[]} o.lines
   * @param {boolean} [o.neutralDeliveryNote] true for drop-shipping to the end customer
   * @param {boolean} [o.express]
   */
  buildOrderPayload({ reference, deliveryAddress, lines, neutralDeliveryNote = false, express = false, comment = '' }) {
    return {
      orderReference: reference,
      orderManagement: 0,
      waitForFreeShipping: 0,
      ...(express ? { expressShipping: 'E' } : {}),
      neutralDeliveryNote: neutralDeliveryNote ? 1 : 0,
      myOrderId: reference,
      comment,
      deliveryAddress,
      orderLines: lines.map((l, i) => ({ sku: l.sku, quantity: l.quantity, lineNumber: String(i + 1), comment: l.comment || '' })),
      testMode: this.opts.testMode,
    };
  }

  createOrder(payload) { return this.request('/v3/orders', { method: 'POST', body: payload }); }
  getOrders() { return this.request('/v3/orders'); }
  getOrder(id) { return this.request(`/v3/orders/${encodeURIComponent(id)}`); }

  // ------------------------------------------------------------------ deliveries & invoices (vendor side)
  getDeliveries() { return this.request('/v3/deliveries'); }
  getDelivery(id) { return this.request(`/v3/deliveries/${encodeURIComponent(id)}`); }
  getDeliveryPdf(id) { return this.request(`/v3/deliveries/${encodeURIComponent(id)}/pdf`, { raw: true }); }
  getInvoices() { return this.request('/v3/invoices'); }
  getInvoice(id) { return this.request(`/v3/invoices/${encodeURIComponent(id)}`); }
  getInvoicePdf(id) { return this.request(`/v3/invoices/${encodeURIComponent(id)}/pdf`, { raw: true }); }

  // ------------------------------------------------------------------ internals
  async #fetch(path, init) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs);
    try {
      return await fetch(this.opts.baseUrl.replace(/\/$/, '') + path, { ...init, signal: ctrl.signal });
    } catch (e) {
      throw new TopTexError(`TopTex unreachable: ${e.name === 'AbortError' ? 'timeout' : e.message}`, 0);
    } finally {
      clearTimeout(timer);
    }
  }

  async #parse(res) {
    const text = await res.text();
    try { return text ? JSON.parse(text) : null; } catch { return text; }
  }
}

export const toptex = new TopTexService();
