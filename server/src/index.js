import express from 'express';
import cors from 'cors';
import { config, toptexConfigured } from './config.js';
import { api } from './routes/index.js';
import { loadCatalog } from './services/catalog.service.js';
import { scheduleCatalogSync } from './services/sync.service.js';
import { HttpError } from './lib/http.js';
import { client, ensureDatabase } from './db.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Crashes are written to server/data/api-error.log (as well as the terminal) so they can be inspected later.
const ERROR_LOG = fileURLToPath(new URL('../data/api-error.log', import.meta.url));
const logCrash = (kind, err) => {
  const line = `[${new Date().toISOString()}] ${kind}: ${err?.stack || err}\n  memory: ${Math.round(process.memoryUsage().rss / 1048576)} MB rss\n`;
  console.error(line);
  try { fs.mkdirSync(new URL('../data/', import.meta.url), { recursive: true }); fs.appendFileSync(ERROR_LOG, line); } catch { /* ignore */ }
};
process.on('unhandledRejection', (e) => logCrash('unhandledRejection', e)); // log, keep serving
process.on('uncaughtException', (e) => { logCrash('uncaughtException', e); process.exit(1); }); // the dev launcher restarts the API

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: config.corsOrigin.split(',').map((s) => s.trim()) }));
app.use(express.json({ limit: '1mb' }));

app.use('/api', api);
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (DB_ERRORS[err.code]) {
    console.error(`[db] ${DB_ERRORS[err.code]}`);
    return res.status(503).json({ error: 'The database is not available. Please try again shortly.' });
  }
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) logCrash(`request error ${_req.method} ${_req.originalUrl}`, err);
  res.status(status).json({ error: status >= 500 && !(err instanceof HttpError) ? 'Server error' : err.message, details: err.details });
});

const DB_ERRORS = {
  ECONNREFUSED: `MySQL is not running on ${config.db.host}:${config.db.port} — start the MySQL service (Windows: Services → MySQL80 → Start, or XAMPP → MySQL → Start).`,
  ER_ACCESS_DENIED_ERROR: `MySQL rejected user "${config.db.user}" — check DB_USER / DB_PASSWORD in server/.env.`,
  ER_BAD_DB_ERROR: `Database "${config.db.database}" does not exist — run: npm run db:init`,
  ER_NO_SUCH_TABLE: 'Tables are missing — run: npm run db:init',
};

const meta = loadCatalog();
const server = app.listen(config.port, () => {
  console.log(`Impress Design API on http://localhost:${config.port}/api`);
  ensureDatabase()
    .then(() => console.log(`  database: ${client === 'sqlite' ? `SQLite (${config.db.sqliteFile})` : `MySQL ${config.db.host}/${config.db.database}`} — ready`))
    .catch((e) => console.error(`  database: NOT READY — ${DB_ERRORS[e.code] || e.message}`));
  scheduleCatalogSync();
  console.log(`  catalog: ${meta.source} · TopTex: ${toptexConfigured() ? 'live' + (config.toptex.testMode ? ' (testMode)' : '') : 'dry-run'} · vendor orders: ${config.vendorOrderMode} · shipping: ${config.shipping.provider}`);
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\nPort ${config.port} is already in use — another copy of the API is still running (an older "npm run dev" window?).\nClose it, or set PORT in server/.env, then run npm run dev again.\n`);
    process.exit(2); // 2 = do not auto-restart
  }
  throw e;
});
