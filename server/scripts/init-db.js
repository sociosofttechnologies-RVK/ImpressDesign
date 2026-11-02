// Creates the tables and the first admin account.
//   SQLite (default): server/data/impress-design.db — also done automatically when the API starts.
//   MySQL (DB_CLIENT=mysql): creates the database from db/schema.sql.
// Usage: npm run db:init
import fs from 'node:fs';
import { config } from '../src/config.js';

if (config.db.client === 'mysql') {
  const mysql = (await import('mysql2/promise')).default;
  const { database, host, port, user, password } = config.db;
  let conn;
  try {
    conn = await mysql.createConnection({ host, port, user, password, multipleStatements: true });
  } catch (e) {
    const hint = {
      ECONNREFUSED: `No MySQL server is running on ${host}:${port}. Start the MySQL service, or use the built-in SQLite instead: set DB_CLIENT=sqlite in server/.env.`,
      ER_ACCESS_DENIED_ERROR: `MySQL rejected user "${user}". Set DB_USER / DB_PASSWORD in server/.env.`,
    }[e.code];
    console.error(`\nCannot connect to MySQL (${e.code}).\n${hint || e.message}\n`);
    process.exit(1);
  }
  const schema = fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8').replaceAll('impress_design', database);
  await conn.query(schema);
  await conn.end();
}

const { ensureDatabase, query, closeDb, client } = await import('../src/db.js');
await ensureDatabase();
const [{ n }] = await query("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'");
console.log(`Database ready (${client}${client === 'sqlite' ? `: ${config.db.sqliteFile}` : `: ${config.db.database}`}) — ${n} admin account(s). Admin login: ${config.admin.email}`);
await closeDb();
