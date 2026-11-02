// Downloads EVERY product from the TopTex API, exactly as TopTex returns it (all fields, colours,
// sizes, prices, images), into ONE JSON file:  server/data/toptex-products-all.json
//
// Usage:  npm run catalog:export                 (default output file)
//         npm run catalog:export -- D:\path\to\file.json
//
// The file is written as it downloads (the raw catalog can be hundreds of MB, so it is never held
// in memory) to a .part file, which is renamed only when the download is complete.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toptex } from '../src/services/TopTexService.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.resolve(process.argv[2] || path.join(here, '..', 'data', 'toptex-products-all.json'));
const partFile = outFile + '.part';
fs.mkdirSync(path.dirname(outFile), { recursive: true });

if (!toptex.configured) {
  console.error('TopTex credentials missing — set TOPTEX_API_KEY, TOPTEX_USERNAME and TOPTEX_PASSWORD in server/.env');
  process.exit(1);
}

const out = fs.createWriteStream(partFile, 'utf8');
const write = (s) => (out.write(s) ? Promise.resolve() : new Promise((r) => out.once('drain', r)));
const seen = new Set();
let count = 0, dupes = 0, total = null;
const started = Date.now();

try {
  await write(`{\n"source": "TopTex API /v3/products/all",\n"exportedAt": "${new Date().toISOString()}",\n"products": [\n`);
  await toptex.getAllProducts({
    log: (m) => console.log(m),
    onPage: async (items, _call, t) => {
      total = t ?? total;
      for (const item of items) {
        const key = item?.catalogReference || JSON.stringify(item).slice(0, 200);
        if (seen.has(key)) { dupes++; continue; }
        seen.add(key);
        await write((count++ ? ',\n' : '') + JSON.stringify(item));
      }
      const mb = (out.bytesWritten / 1048576).toFixed(1);
      console.log(`${count}${total ? ` / ${total}` : ''} products · ${mb} MB · ${Math.round((Date.now() - started) / 1000)} s`);
    },
  });
  await write(`\n],\n"count": ${count},\n"totalCountReported": ${total ?? 'null'}\n}\n`);
  await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
  fs.renameSync(partFile, outFile);
  console.log(`\nDone: ${count} products${dupes ? ` (${dupes} duplicates dropped)` : ''} -> ${outFile} (${(fs.statSync(outFile).size / 1048576).toFixed(1)} MB)`);
} catch (e) {
  out.destroy();
  console.error(`\nExport failed after ${count} products: ${e.message}`);
  console.error(`Partial data left in ${partFile} (not valid JSON).`);
  process.exit(1);
}
