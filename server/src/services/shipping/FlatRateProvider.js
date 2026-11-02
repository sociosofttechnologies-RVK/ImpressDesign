// Works without any partner account: prices come from config.shipping.methods × zone factor,
// tracking numbers are generated locally and tracking events are entered by the admin.
import crypto from 'node:crypto';

const r2 = (n) => Math.round(n * 100) / 100;

export class FlatRateProvider {
  constructor(cfg) { this.cfg = cfg; this.name = cfg.partnerName; this.live = false; }

  async quote({ zone, weightKg, goodsTotal }) {
    const z = this.cfg.zones[zone] || this.cfg.zones.national;
    const free = this.cfg.freeShippingOver > 0 && goodsTotal >= this.cfg.freeShippingOver;
    return this.cfg.methods
      .filter((m) => !m.localOnly || zone === 'local')
      .map((m) => ({
        code: m.code,
        label: m.label,
        carrier: this.name,
        zone,
        zoneLabel: z.label,
        days: m.days,
        cost: free && m.code === 'standard' ? 0 : r2((m.base + m.perKg * Math.max(0, weightKg)) * (m.base ? z.factor : 1)),
      }));
  }

  async createShipment({ order }) {
    const tracking = `ID${new Date().toISOString().slice(2, 10).replace(/-/g, '')}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    return { carrier: this.name, service: order.shipping_method, trackingNumber: tracking, labelUrl: null, events: [] };
  }

  // No remote tracking: events are whatever the admin recorded.
  async track() { return null; }
}
