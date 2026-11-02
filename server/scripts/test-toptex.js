// Checks the TopTex connection step by step with the credentials in server/.env.
// Usage: npm run toptex:test
import { config } from '../src/config.js';

const t = config.toptex;
const base = t.baseUrl.replace(/\/$/, '');
const ok = (m) => console.log(`  \x1b[32m✔\x1b[0m ${m}`);
const bad = (m) => console.log(`  \x1b[31m✘\x1b[0m ${m}`);
const info = (m) => console.log(`    ${m}`);
const short = (b) => (typeof b === 'string' ? b : JSON.stringify(b ?? '')).slice(0, 300);

async function call(path, { method = 'GET', headers = {}, body } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(base + path, {
      method, signal: ctrl.signal,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  } catch (e) {
    return { status: 0, data: e.name === 'AbortError' ? 'timeout after 30 s' : `${e.message}${e.cause ? ` (${e.cause.code || e.cause.message})` : ''}` };
  } finally {
    clearTimeout(timer);
  }
}

const jwtExp = (s) => {
  try { return new Date(JSON.parse(Buffer.from(s.split('.')[1], 'base64url').toString()).exp * 1000); } catch { return null; }
};

console.log(`\nTopTex connection test — ${base}\n`);

// 1. Settings
console.log('1. Settings in server/.env');
let fatal = false;
for (const [k, v] of [['TOPTEX_API_KEY', t.apiKey], ['TOPTEX_USERNAME', t.username], ['TOPTEX_PASSWORD', t.password]]) {
  if (!v) { bad(`${k} is empty`); fatal = true; } else ok(`${k} set (${v.length} characters)`);
}
if (t.apiKey && t.apiKey.startsWith('eyJ') && t.apiKey.split('.').length === 3) {
  const exp = jwtExp(t.apiKey);
  bad('TOPTEX_API_KEY contains a login token (JWT), not the API key.');
  info(`That is the {{token}} Postman stores after "V3 Authenticate"${exp ? ` (it expires ${exp.toISOString()})` : ''}.`);
  info('Use the {{api_key}} value from your Postman environment instead — the fixed key TopTex gave you (usually ~40 characters).');
  fatal = true;
}
if (/^["'].*["']$/.test(t.apiKey || '') || /^["'].*["']$/.test(t.password || '')) info('Note: a value is wrapped in quotes — remove the quotes in .env.');
if (fatal) { console.log('\nFix the settings above, then run: npm run toptex:test\n'); process.exit(1); }

// 2. Reachability
console.log('\n2. Can this computer reach TopTex?');
const ping = await call('/v3/attributes');
if (ping.status === 0) { bad(`No connection: ${ping.data}`); info('Check the internet connection, proxy/firewall, and TOPTEX_URL.'); process.exit(1); }
ok(`Server answered (HTTP ${ping.status})`);

// 3. Authenticate
console.log('\n3. Log in — POST /v3/authenticate (x-api-key + username/password)');
const auth = await call('/v3/authenticate', { method: 'POST', headers: { 'x-api-key': t.apiKey }, body: { username: t.username, password: t.password } });
if (auth.status !== 200 || !auth.data?.token) {
  bad(`Login failed: HTTP ${auth.status} ${short(auth.data)}`);
  if (auth.status === 403) info('403 = the API key was refused. Check TOPTEX_API_KEY.');
  else if (auth.status === 401 || auth.status === 400) info('Username or password refused. Check TOPTEX_USERNAME / TOPTEX_PASSWORD (same as the TopTex website login).');
  else if (auth.status === 404) info('404 = wrong address. TOPTEX_URL should be https://api.toptex.io');
  process.exit(1);
}
const token = auth.data.token;
const exp = jwtExp(token);
ok(`Logged in — token received${exp ? `, valid until ${exp.toISOString()}` : ''}`);
const H = { 'x-api-key': t.apiKey, 'x-toptex-authorization': token };

// 4. Catalog page
console.log(`\n4. Catalog — GET /v3/products/all?usage_right=${t.usageRight}&page_number=1&page_size=5`);
const page = await call(`/v3/products/all?usage_right=${encodeURIComponent(t.usageRight)}&page_number=1&page_size=5&display_prices=1`, { headers: H });
if (page.status !== 200) {
  bad(`HTTP ${page.status} ${short(page.data)}`);
  if (page.status === 403) info(`403 here usually means this account has no access to usage_right=${t.usageRight}. Try TOPTEX_USAGE_RIGHT=b2b_uniquement.`);
  process.exit(1);
}
const items = Array.isArray(page.data) ? page.data : page.data?.items || [];
ok(`${items.length} products on page 1 · total_count = ${page.data?.total_count ?? 'not given'} · page_size answered = ${page.data?.page_size ?? '?'}`);
for (const p of items.slice(0, 5)) info(`${p.catalogReference}  ${p.brand || ''}  ${(p.designation?.[t.lang] || p.designation?.en || '').slice(0, 50)}  ${p.colors?.[0]?.sizes?.[0]?.publicUnitPrice ?? ''}`);

// 5. Price + stock for one SKU
const sku = items[0]?.colors?.[0]?.sizes?.[0]?.sku;
if (sku) {
  console.log(`\n5. Price and stock — GET /v3/products/${sku}/price and /inventory`);
  const [price, inv] = await Promise.all([call(`/v3/products/${encodeURIComponent(sku)}/price`, { headers: H }), call(`/v3/products/${encodeURIComponent(sku)}/inventory`, { headers: H })]);
  (price.status === 200 ? ok : bad)(`price: HTTP ${price.status} ${short(price.data).slice(0, 160)}`);
  (inv.status === 200 ? ok : bad)(`inventory: HTTP ${inv.status} ${short(inv.data).slice(0, 160)}`);
}

console.log('\nAll good — start the app with npm run dev and it will download the full catalog.\n');
