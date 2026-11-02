// All runtime configuration lives here. Values come from server/.env (see .env.example).
import 'dotenv/config';
import { fileURLToPath } from 'node:url';

const env = (k, d) => (process.env[k] === undefined || process.env[k] === '' ? d : process.env[k]);
const num = (k, d) => Number(env(k, d));
const bool = (k, d) => String(env(k, d)).toLowerCase() === 'true';

export const config = {
  port: num('PORT', 4000),
  corsOrigin: env('CORS_ORIGIN', 'http://localhost:5173'),
  jwtSecret: env('JWT_SECRET', 'change-me-in-production'),
  jwtTtl: env('JWT_TTL', '7d'),

  db: {
    // sqlite = zero-install local file database (development); mysql = MySQL/MariaDB (production)
    client: env('DB_CLIENT', 'sqlite').toLowerCase(),
    sqliteFile: env('SQLITE_FILE', fileURLToPath(new URL('../data/impress-design.db', import.meta.url))),
    host: env('DB_HOST', '127.0.0.1'),
    port: num('DB_PORT', 3306),
    user: env('DB_USER', 'root'),
    password: env('DB_PASSWORD', ''),
    database: env('DB_NAME', 'impress_design'),
  },

  // TopTex vendor API. Leave username/password/key empty to run in dry-run mode:
  // vendor orders are recorded locally and nothing is sent to TopTex.
  toptex: {
    baseUrl: env('TOPTEX_URL', 'https://api.toptex.io'),
    apiKey: env('TOPTEX_API_KEY', ''),
    username: env('TOPTEX_USERNAME', ''),
    password: env('TOPTEX_PASSWORD', ''),
    testMode: bool('TOPTEX_TEST_MODE', 'true'), // sent as testMode on POST /v3/orders
    usageRight: env('TOPTEX_USAGE_RIGHT', 'b2b_b2c'),
    lang: env('TOPTEX_LANG', 'en'),
    pageSize: num('TOPTEX_PAGE_SIZE', 10),
    timeoutMs: num('TOPTEX_TIMEOUT_MS', 30000),
  },

  // Full catalog is re-downloaded from TopTex this often (0 = only on start / manual sync).
  catalogRefreshHours: num('CATALOG_REFRESH_HOURS', 24),

  // 'immediate' = one TopTex order per customer order, sent when the customer places it.
  // 'grouped'   = items wait in the admin "Vendor orders" screen and are sent together.
  // Direct (non-customised) orders are always sent immediately, delivered to the customer.
  vendorOrderMode: env('VENDOR_ORDER_MODE', 'grouped'),

  // Workshop address: delivery address for TopTex orders that need customisation, and shipping origin.
  workshop: {
    addressTitle: env('WORKSHOP_TITLE', 'Impress Design workshop'),
    street1: env('WORKSHOP_STREET1', ''),
    street2: env('WORKSHOP_STREET2', ''),
    postCode: env('WORKSHOP_POSTCODE', '75001'),
    city: env('WORKSHOP_CITY', 'Paris'),
    country: env('WORKSHOP_COUNTRY', 'fr'),
    contactName: env('WORKSHOP_CONTACT', 'Impress Design'),
    contactPhone: env('WORKSHOP_PHONE', ''),
    contactEmail: env('WORKSHOP_EMAIL', ''),
  },

  company: {
    name: env('COMPANY_NAME', 'Impress Design'),
    address: env('COMPANY_ADDRESS', 'Île-de-France, France'),
    vat: env('COMPANY_VAT', ''),
    email: env('COMPANY_EMAIL', ''),
  },

  currency: 'EUR',
  taxRate: num('TAX_RATE', 0.2), // French VAT; catalog prices are treated as excl. VAT

  // Marking prices — PLACEHOLDER values, replace with the workshop's real price list.
  // Cost per line = setup per placement + perUnit per placement × quantity.
  marking: {
    Printing: { setup: num('PRINT_SETUP', 25), perUnit: num('PRINT_PER_UNIT', 3.5) },
    Embroidery: { setup: num('EMBROIDERY_SETUP', 35), perUnit: num('EMBROIDERY_PER_UNIT', 5) },
  },

  // Delivery partner. 'flatrate' works offline from the table below; 'http' calls a partner REST API
  // (see services/shipping/HttpProvider.js). Customer-paid shipping is added to the order total.
  shipping: {
    provider: env('SHIPPING_PROVIDER', 'flatrate'),
    partnerName: env('SHIPPING_PARTNER_NAME', 'Delivery partner'),
    apiUrl: env('SHIPPING_API_URL', ''),
    apiKey: env('SHIPPING_API_KEY', ''),
    trackingUrlTemplate: env('SHIPPING_TRACKING_URL', ''), // e.g. https://track.example.com/{tracking}
    defaultItemWeightKg: num('DEFAULT_ITEM_WEIGHT_KG', 0.25),
    freeShippingOver: num('FREE_SHIPPING_OVER', 0), // goods total excl. VAT; 0 disables
    // Distance factor: zone multipliers measured from the workshop.
    zones: {
      local: { label: 'Île-de-France', factor: 1 },
      national: { label: 'Rest of France', factor: 1.25 },
      eu: { label: 'European Union', factor: 2 },
      world: { label: 'Rest of world', factor: 3.5 },
    },
    // PLACEHOLDER rates — replace with the partner's contract rates.
    methods: [
      { code: 'standard', label: 'Standard (3–5 working days)', base: 6.9, perKg: 0.9, days: [3, 5] },
      { code: 'express', label: 'Express (24–48 h)', base: 14.9, perKg: 1.6, days: [1, 2] },
      { code: 'pickup', label: 'Collect from workshop', base: 0, perKg: 0, days: [0, 0], localOnly: true },
    ],
  },

  uploads: {
    dir: env('UPLOAD_DIR', fileURLToPath(new URL('../uploads/', import.meta.url))),
    maxBytes: num('UPLOAD_MAX_MB', 20) * 1024 * 1024,
  },

  admin: {
    email: env('ADMIN_EMAIL', 'admin@impress-design.local'),
    password: env('ADMIN_PASSWORD', 'ChangeMe123!'),
    name: env('ADMIN_NAME', 'Admin'),
  },
};

export const toptexConfigured = () => Boolean(config.toptex.apiKey && config.toptex.username && config.toptex.password);
