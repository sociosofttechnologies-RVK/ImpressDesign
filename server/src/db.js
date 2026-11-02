// Database access for two engines behind one small API (query / one / tx):
//   DB_CLIENT=sqlite (default) — local file database via sql.js (SQLite in WebAssembly), nothing to install.
//   DB_CLIENT=mysql            — MySQL 8 / MariaDB for production (mysql2 pool).
// Service code writes portable SQL: `?` placeholders (arrays expand for IN (?)), the NOW
// fragment below for timestamps, and no engine-specific functions.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

export const client = config.db.client;

/** Current-timestamp SQL fragment for the active engine. */
export const NOW = client === 'sqlite' ? "strftime('%Y-%m-%dT%H:%M:%fZ','now')" : 'NOW()';

let impl;

if (client === 'sqlite') {
  // sql.js = SQLite compiled to WebAssembly: no native module, so it cannot crash the process
  // (Node's built-in node:sqlite is experimental and crashed on Windows). The whole database is held
  // in memory and written to SQLITE_FILE after every change — fine for local development.
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  const file = config.db.sqliteFile;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // A database left by the earlier node:sqlite version keeps its data in a -wal side file that sql.js
  // cannot read; set it aside and start fresh (local test data only).
  if (fs.existsSync(`${file}-wal`)) {
    const stamp = Date.now();
    for (const f of [file, `${file}-wal`, `${file}-shm`]) if (fs.existsSync(f)) fs.renameSync(f, `${f}.old-${stamp}`);
    console.log(`  database: previous local database moved aside (${path.basename(file)}*.old-${stamp}); starting fresh`);
  }
  const db = fs.existsSync(file) ? new SQL.Database(fs.readFileSync(file)) : new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');

  let inTx = false;
  const persist = () => {
    if (inTx) return;
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, Buffer.from(db.export()));
    fs.renameSync(tmp, file);
    db.run('PRAGMA foreign_keys = ON'); // export() resets it
  };

  const toParam = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v instanceof Date ? v.toISOString() : v);
  // mysql2-style expansion: an array bound to `?` becomes `?, ?, ?`.
  const expand = (sql, params) => {
    const flat = [];
    let i = 0;
    const out = sql.replace(/\?/g, () => {
      const p = params[i++];
      if (Array.isArray(p)) { flat.push(...p.map(toParam)); return p.map(() => '?').join(', ') || 'NULL'; }
      flat.push(toParam(p));
      return '?';
    });
    return [out, flat];
  };
  const run = (sql, params = []) => {
    const [s, p] = expand(sql, params);
    if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(s)) {
      const stmt = db.prepare(s);
      try {
        stmt.bind(p);
        const rows = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        return rows;
      } finally {
        stmt.free();
      }
    }
    db.run(s, p);
    const insertId = Number(db.exec('SELECT last_insert_rowid()')[0]?.values[0][0] || 0);
    const affectedRows = db.getRowsModified();
    persist();
    return { insertId, affectedRows };
  };

  // One connection: transactions are serialised so concurrent requests never share one.
  let chain = Promise.resolve();
  impl = {
    query: async (sql, params) => run(sql, params),
    tx: (fn) => {
      const next = chain.then(async () => {
        db.run('BEGIN');
        inTx = true;
        try {
          const result = await fn({ query: async (s, p) => run(s, p), one: async (s, p) => run(s, p)[0] || null });
          db.run('COMMIT');
          inTx = false;
          persist();
          return result;
        } catch (e) {
          inTx = false;
          try { db.run('ROLLBACK'); } catch { /* already rolled back */ }
          throw e;
        }
      });
      chain = next.catch(() => {});
      return next;
    },
    exec: (sql) => { db.exec(sql); persist(); },
    close: () => { persist(); db.close(); },
  };
} else {
  const mysql = (await import('mysql2/promise')).default;
  const pool = mysql.createPool({
    host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.password, database: config.db.database,
    waitForConnections: true, connectionLimit: 10, decimalNumbers: true,
  });
  impl = {
    query: async (sql, params = []) => (await pool.query(sql, params))[0],
    tx: async (fn) => {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const result = await fn({
          query: async (s, p = []) => (await conn.query(s, p))[0],
          one: async (s, p = []) => (await conn.query(s, p))[0][0] || null,
        });
        await conn.commit();
        return result;
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    },
    close: () => pool.end(),
  };
}

export const query = (sql, params = []) => impl.query(sql, params);
export const one = async (sql, params = []) => (await impl.query(sql, params))[0] || null;
export const tx = (fn) => impl.tx(fn);
export const closeDb = () => impl.close();

// JSON columns come back as strings from SQLite and MariaDB; normalise.
export const json = (v, fallback = null) => {
  if (v == null) return fallback;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return fallback; }
};

/** Business document numbers: ID26101500042, PO2610150007, INV26000012. */
export function docNumber(prefix, id, digits, datePart = 'ymd') {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2), mm = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${prefix}${datePart === 'ymd' ? yy + mm + dd : yy}${String(id).padStart(digits, '0')}`;
}

/** Unique placeholder written before the row id (and so the real number) is known. */
export const tempNumber = () => `TMP${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.slice(0, 20);

// ------------------------------------------------------------------ schema + first admin
const SCHEMA = {
  sqlite: new URL('../db/schema.sqlite.sql', import.meta.url),
  mysql: new URL('../db/schema.sql', import.meta.url),
};

/** SQLite: creates missing tables. Both engines: creates the admin account if there is none. */
export async function ensureDatabase({ log = console.log } = {}) {
  if (client === 'sqlite') impl.exec(fs.readFileSync(SCHEMA.sqlite, 'utf8'));
  await migrate(log);
  const admin = await one("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (!admin) {
    const bcrypt = (await import('bcryptjs')).default;
    const hash = await bcrypt.hash(config.admin.password, 10);
    await query("INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, 'admin')", [config.admin.email.toLowerCase(), hash, config.admin.name]);
    log(`  admin account created: ${config.admin.email} / ${config.admin.password}`);
  }
}

// Columns added after the first release. CREATE TABLE IF NOT EXISTS does not touch existing tables,
// so each one is added here when an older database is missing it (both engines, existing data kept).
const ADDED_COLUMNS = [
  ['users', 'disabled', { sqlite: 'INTEGER NOT NULL DEFAULT 0', mysql: 'TINYINT(1) NOT NULL DEFAULT 0' }],
  ['orders', 'admin_notes', { sqlite: 'TEXT NULL', mysql: 'TEXT NULL' }],
  ['order_items', 'design_spec', { sqlite: 'TEXT NULL', mysql: 'JSON NULL' }],
];

async function migrate(log) {
  for (const [table, column, ddl] of ADDED_COLUMNS) {
    try {
      await query(`SELECT ${column} FROM ${table} LIMIT 1`);
    } catch {
      await query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl[client]}`);
      log(`  database: added ${table}.${column}`);
    }
  }
}

export const mysqlSchemaFile = SCHEMA.mysql;
