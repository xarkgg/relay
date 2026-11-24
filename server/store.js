import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const id = prefix => `${prefix}_${randomUUID()}`;
export const hash = content => createHash('sha256').update(content).digest('hex');

export function openStore(file = ':memory:') {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS imports (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, content TEXT NOT NULL,
      digest TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS grants (
      id TEXT PRIMARY KEY, agent TEXT NOT NULL, version TEXT NOT NULL,
      inputs TEXT NOT NULL, tools TEXT NOT NULL, expires_at INTEGER NOT NULL,
      revoked_at INTEGER, max_runs INTEGER NOT NULL CHECK(max_runs BETWEEN 1 AND 50),
      max_drafts INTEGER NOT NULL CHECK(max_drafts BETWEEN 1 AND 5),
      used_runs INTEGER NOT NULL DEFAULT 0 CHECK(used_runs >= 0), created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY, grant_id TEXT NOT NULL REFERENCES grants(id),
      mode TEXT NOT NULL CHECK(mode IN ('template','local-model')),
      state TEXT NOT NULL CHECK(state IN ('running','completed','blocked','failed','interrupted')),
      report TEXT, error_code TEXT, started_at INTEGER NOT NULL, finished_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id),
      input_id TEXT NOT NULL REFERENCES imports(id), invoice_id TEXT NOT NULL,
      customer TEXT NOT NULL, source_row INTEGER NOT NULL, body TEXT NOT NULL,
      digest TEXT NOT NULL, approved_digest TEXT,
      state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','approved','dismissed'))
    );
    CREATE TABLE IF NOT EXISTS exports (
      id TEXT PRIMARY KEY, grant_id TEXT NOT NULL REFERENCES grants(id),
      content TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      seq INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL,
      grant_id TEXT, run_id TEXT, detail TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    PRAGMA user_version = 1;
  `);
  // In-flight work is never automatically replayed after a process restart.
  db.prepare("UPDATE runs SET state='interrupted', error_code='RESTARTED', finished_at=? WHERE state='running'")
    .run(Date.now());
  return {
    db,
    close: () => db.close(),
    transaction(fn) {
      db.exec('BEGIN IMMEDIATE');
      try { const result = fn(); db.exec('COMMIT'); return result; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    event(type, { grantId = null, runId = null, detail = {} } = {}) {
      db.prepare('INSERT INTO events(type,grant_id,run_id,detail,created_at) VALUES(?,?,?,?,?)')
        .run(type, grantId, runId, JSON.stringify(detail), Date.now());
    }
  };
}
