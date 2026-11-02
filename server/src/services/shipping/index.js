// Delivery partner abstraction. The rest of the app only calls these three functions,
// so switching partner means writing one provider file and setting SHIPPING_PROVIDER.
import { config } from '../../config.js';
import { FlatRateProvider } from './FlatRateProvider.js';
import { HttpProvider } from './HttpProvider.js';

const providers = { flatrate: FlatRateProvider, http: HttpProvider };
const Provider = providers[config.shipping.provider] || FlatRateProvider;
export const shippingProvider = new Provider(config.shipping);

const IDF = ['75', '77', '78', '91', '92', '93', '94', '95'];
const EU = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];

/** Distance factor from the workshop, by destination. */
export function zoneFor({ country, postCode }) {
  const c = String(country || '').toUpperCase();
  const home = String(config.workshop.country || 'FR').toUpperCase();
  if (c === home) {
    const dept = String(postCode || '').trim().slice(0, 2);
    const homeDept = String(config.workshop.postCode || '').slice(0, 2);
    if (c === 'FR' ? IDF.includes(dept) && IDF.includes(homeDept) : dept === homeDept) return 'local';
    return 'national';
  }
  return EU.includes(c) ? 'eu' : 'world';
}

export const quoteShipping = (args) => shippingProvider.quote({ ...args, zone: zoneFor(args.address) });
export const createShipment = (args) => shippingProvider.createShipment(args);
export const trackShipment = (shipment) => shippingProvider.track(shipment);
export const trackingUrl = (tracking) => (config.shipping.trackingUrlTemplate && tracking ? config.shipping.trackingUrlTemplate.replace('{tracking}', encodeURIComponent(tracking)) : null);
