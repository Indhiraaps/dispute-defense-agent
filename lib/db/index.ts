import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { seedDemoDisputes } from "../seed/seed";
import { loadSnapshot, readSnapshotFile } from "../seed/snapshot";

/**
 * One SQLite file at data/app.db. Render's free disk is wiped on restart,
 * so the demo disputes are re-seeded whenever the database has none.
 */
const DATA_DIR = path.join(process.cwd(), "data");
export const DB_PATH = path.join(DATA_DIR, "app.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS disputes (
  id             TEXT PRIMARY KEY,
  source         TEXT NOT NULL,
  claim_type     TEXT NOT NULL,
  reason         TEXT NOT NULL,
  buyer_claim    TEXT NOT NULL DEFAULT '',
  paypal_status  TEXT NOT NULL DEFAULT '',
  stage          TEXT NOT NULL DEFAULT '',
  amount         TEXT NOT NULL,
  currency       TEXT NOT NULL,
  item_name      TEXT NOT NULL DEFAULT '',
  buyer_name     TEXT NOT NULL DEFAULT '',
  buyer_country  TEXT NOT NULL DEFAULT '',
  transaction_id TEXT NOT NULL DEFAULT '',
  order_id       TEXT NOT NULL DEFAULT '',
  opened_at      TEXT NOT NULL,
  seller_due_at  TEXT,
  state          TEXT NOT NULL DEFAULT 'NEW',
  outcome        TEXT,
  raw            TEXT,
  updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence (
  dispute_id   TEXT NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  id           TEXT NOT NULL,
  kind         TEXT NOT NULL,
  source_ref   TEXT NOT NULL,
  source       TEXT NOT NULL,
  title        TEXT NOT NULL,
  text         TEXT NOT NULL,
  facts        TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  PRIMARY KEY (dispute_id, id),
  UNIQUE (dispute_id, source_ref)
);

CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  dispute_id TEXT NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  at         TEXT NOT NULL,
  type       TEXT NOT NULL,
  detail     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS events_by_dispute ON events(dispute_id, id);

CREATE TABLE IF NOT EXISTS submissions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  dispute_id TEXT NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  at         TEXT NOT NULL,
  data       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS submissions_by_dispute ON submissions(dispute_id, id);

CREATE TABLE IF NOT EXISTS outcomes (
  dispute_id TEXT PRIMARY KEY REFERENCES disputes(id) ON DELETE CASCADE,
  at         TEXT NOT NULL,
  data       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS case_files (
  dispute_id TEXT PRIMARY KEY REFERENCES disputes(id) ON DELETE CASCADE,
  data       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analysis (
  dispute_id TEXT PRIMARY KEY REFERENCES disputes(id) ON DELETE CASCADE,
  data       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

// Survive Next.js hot reloads in development without opening many handles.
const globalForDb = globalThis as unknown as { __disputeDb?: Database.Database };

export function getDb(): Database.Database {
  if (globalForDb.__disputeDb) return globalForDb.__disputeDb;
  mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM disputes").get() as { n: number };
  if (n === 0) {
    // A fresh disk (e.g. after a Render restart): start from the committed snapshot
    // of the agent's finished work, or from the bare demo disputes if there is none.
    const snap = readSnapshotFile();
    if (snap) loadSnapshot(db, snap);
    else seedDemoDisputes(db);
  }
  globalForDb.__disputeDb = db;
  return db;
}

export function closeDb() {
  globalForDb.__disputeDb?.close();
  globalForDb.__disputeDb = undefined;
}
