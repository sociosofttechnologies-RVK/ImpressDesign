// Template for a delivery partner REST API (Sendcloud, Boxtal, Shiprocket, Colissimo…).
// Set SHIPPING_PROVIDER=http, SHIPPING_API_URL and SHIPPING_API_KEY, then adapt the three
// mapping blocks below to the partner's documented request/response format.
// Expected endpoints (rename to match the partner):
//   POST {url}/rates      -> list of services with prices for a parcel and destination
//   POST {url}/shipments  -> creates the shipment, returns tracking number + label
//   GET  {url}/tracking/:n -> status history
import { FlatRateProvider } from './FlatRateProvider.js';
import { config } from '../../config.js';

export class HttpProvider {
  constructor(cfg) {
    this.cfg = cfg;
    this.name = cfg.partnerName;
    this.live = true;
    this.fallback = new FlatRateProvider(cfg); // used for quotes if the partner API is down
  }

  async call(path, init = {}) {
    if (!this.cfg.apiUrl) throw new Error('SHIPPING_API_URL is not set');
    const res = await fetch(this.cfg.apiUrl.replace(/\/$/, '') + path, {
      ...init,
      headers: { authorization: `Bearer ${this.cfg.apiKey}`, 'content-type': 'application/json', ...(init.headers || {}) },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`Delivery partner ${path} failed (${res.status})`);
    return body;
  }

  async quote({ address, weightKg, zone, goodsTotal }) {
    try {
      const body = await this.call('/rates', {
        method: 'POST',
        body: JSON.stringify({
          from: { postCode: config.workshop.postCode, country: config.workshop.country },
          to: { postCode: address.postCode, city: address.city, country: address.country },
          parcel: { weightKg },
        }),
      });
      // ---- map partner response -> [{code,label,carrier,cost,days}]
      return (body?.rates || []).map((r) => ({
        code: String(r.code || r.service_code), label: r.name || r.service_name, carrier: r.carrier || this.name,
        zone, cost: Number(r.price ?? r.amount), days: r.days ? [r.days, r.days] : null,
      }));
    } catch (e) {
      console.warn('[shipping] partner quote failed, using flat rates:', e.message);
      return this.fallback.quote({ zone, weightKg, goodsTotal });
    }
  }

  async createShipment({ order, weightKg }) {
    const body = await this.call('/shipments', {
      method: 'POST',
      body: JSON.stringify({
        reference: order.order_number,
        service: order.shipping_method,
        from: config.workshop,
        to: {
          name: order.contact_name, company: order.company, phone: order.contact_phone, email: order.contact_email,
          street1: order.ship_street1, street2: order.ship_street2, postCode: order.ship_post_code, city: order.ship_city, country: order.ship_country,
        },
        parcel: { weightKg },
      }),
    });
    // ---- map partner response
    return {
      carrier: body?.carrier || this.name,
      service: body?.service || order.shipping_method,
      trackingNumber: body?.tracking_number || body?.trackingNumber,
      labelUrl: body?.label_url || body?.labelUrl || null,
      events: [],
    };
  }

  async track(shipment) {
    if (!shipment.tracking_number) return null;
    const body = await this.call(`/tracking/${encodeURIComponent(shipment.tracking_number)}`);
    // ---- map partner response -> [{status, description, location, occurredAt}]
    return (body?.events || []).map((e) => ({
      status: e.status, description: e.description || e.message || e.status, location: e.location || null, occurredAt: e.date || e.timestamp,
    }));
  }
}
