import pg from 'pg';
import { RelayError } from '../errors.js';

export function tlsForUrl(value,rejectUnauthorized = true) {
  if (/[?&]sslmode=(disable|allow)\b/.test(value)) return false;
  try {
    if (['localhost','127.0.0.1','::1'].includes(new URL(value).hostname)) return undefined;
  } catch { /* The driver will report the malformed connection string. */ }
  return {rejectUnauthorized};
}

export function connectionStringForTls(value,tls) {
  if (!tls) return value;
  try {
    const url=new URL(value);
    url.searchParams.delete('sslmode');
    return url.toString();
  } catch { return value; }
}

export const COMMERCE_MIGRATIONS = [[`
CREATE TABLE IF NOT EXISTS relay_accounts (
  id TEXT PRIMARY KEY, pi_uid TEXT NOT NULL UNIQUE, username TEXT, created_at BIGINT NOT NULL
)`,`CREATE TABLE IF NOT EXISTS relay_sessions (
  token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES relay_accounts(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL, scopes TEXT NOT NULL, expires_at BIGINT NOT NULL
)`,`CREATE TABLE IF NOT EXISTS relay_auth_limits (
  bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at BIGINT NOT NULL
)`,`CREATE TABLE IF NOT EXISTS relay_intents (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES relay_accounts(id),
  agent TEXT NOT NULL, network TEXT NOT NULL, merchant TEXT NOT NULL,
  amount_stroops BIGINT NOT NULL CHECK(amount_stroops>0),
  state TEXT NOT NULL CHECK(state IN ('open','approved','completed','cancelled')),
  payment_id TEXT UNIQUE, created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL
)`,`CREATE UNIQUE INDEX IF NOT EXISTS relay_open_intent ON relay_intents(account_id,agent,network)
  WHERE state IN ('open','approved')`,`CREATE TABLE IF NOT EXISTS relay_payments (
  id TEXT PRIMARY KEY, intent_id TEXT NOT NULL UNIQUE REFERENCES relay_intents(id),
  state TEXT NOT NULL CHECK(state IN ('pending','approved','completed','cancelled')),
  network TEXT NOT NULL, txid TEXT, completed_at BIGINT,
  UNIQUE(network,txid)
)`,`CREATE TABLE IF NOT EXISTS relay_entitlements (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES relay_accounts(id),
  payment_id TEXT NOT NULL UNIQUE REFERENCES relay_payments(id), agent TEXT NOT NULL,
  network TEXT NOT NULL, starts_at BIGINT NOT NULL, expires_at BIGINT NOT NULL
)`],[`CREATE TABLE IF NOT EXISTS relay_pairings (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES relay_accounts(id),
  entitlement_id TEXT NOT NULL REFERENCES relay_entitlements(id), code_hash TEXT NOT NULL UNIQUE,
  expires_at BIGINT NOT NULL, used_at BIGINT, created_at BIGINT NOT NULL
)`,`CREATE TABLE IF NOT EXISTS relay_devices (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES relay_accounts(id),
  entitlement_id TEXT NOT NULL REFERENCES relay_entitlements(id), public_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL, revoked_at BIGINT, created_at BIGINT NOT NULL, last_seen_at BIGINT NOT NULL
)`,`CREATE INDEX IF NOT EXISTS relay_devices_account ON relay_devices(account_id,created_at)`]];

export async function applyCommerceMigrations(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS relay_schema_migrations (
    version INTEGER PRIMARY KEY, applied_at BIGINT NOT NULL
  )`);
  const rows=await client.query('SELECT version FROM relay_schema_migrations ORDER BY version');
  const applied=new Set(rows.rows.map(row=>Number(row.version)));
  const newest=Math.max(0,...applied);
  if (newest>COMMERCE_MIGRATIONS.length) throw new RelayError('DATABASE_VERSION_NEWER',
    'The database was written by a newer Relay release.',503);
  for (let index=0;index<COMMERCE_MIGRATIONS.length;index++) {
    const version=index+1;
    if (applied.has(version)) continue;
    for (const statement of COMMERCE_MIGRATIONS[index]) await client.query(statement);
    await client.query('INSERT INTO relay_schema_migrations(version,applied_at) VALUES($1,$2)',[version,Date.now()]);
  }
}

export async function openCommerceDatabase(config) {
  let database;
  if (config.databaseUrl) {
    const ssl=tlsForUrl(config.databaseUrl,config.pgTlsVerify !== false);
    const pool = new pg.Pool({connectionString:connectionStringForTls(config.databaseUrl,ssl), ssl,
      max:3, connectionTimeoutMillis:5000, idleTimeoutMillis:10_000});
    database = {
      query: (sql, params) => pool.query(sql, params),
      exec: sql => pool.query(sql),
      async transaction(fn) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await fn({query:(sql,params)=>client.query(sql,params)});
          await client.query('COMMIT');
          return result;
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
      },
      close: () => pool.end()
    };
  } else throw new RelayError('NO_DATABASE','The hosted account service needs a persistent Postgres connection.',503);
  try {
    await database.transaction(async tx=>{
      await tx.query("SELECT pg_advisory_xact_lock(hashtext('relay-commerce-schema-v1'))");
      await applyCommerceMigrations(tx);
    });
  }
  catch (error) { await database.close(); throw error; }
  return database;
}
