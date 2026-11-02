// Downloads the full TopTex catalog (paged) into server/data/catalog.json.
// Usage: npm run catalog:sync
import { syncCatalog } from '../src/services/sync.service.js';

try {
  const meta = await syncCatalog({ log: (m) => console.log(m) });
  console.log(`Catalog saved: ${meta.sourceTotal} TopTex items -> server/data/catalog.json`);
} catch (e) {
  console.error('Sync failed:', e.message);
  process.exit(1);
}
