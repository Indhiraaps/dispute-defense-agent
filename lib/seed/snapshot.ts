import type Database from "better-sqlite3";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { DEMO_DISPUTES } from "./demo-store";

/**
 * A copy of the database's finished work (evidence, agent analysis, drafts,
 * timelines) saved in seed/snapshot.json and committed with the code.
 *
 * Render's free disk is wiped on every restart, and every wake-up after sleep
 * is a restart. Without this, the demo would come back without the agent's
 * results. With it, a fresh server starts exactly where the last good run
 * left off, and no AI quota is spent.
 */

export const SNAPSHOT_PATH = path.join(process.cwd(), "seed", "snapshot.json");
const TABLES = ["disputes", "evidence", "events", "analysis", "case_files", "submissions", "outcomes"] as const;
type Table = (typeof TABLES)[number];

export type Snapshot = {
  version: 1;
  createdAt: string;
  tables: Record<Table, Record<string, unknown>[]>;
};

/** Sandbox account emails can appear inside saved PayPal responses; never commit them. */
function redact(value: unknown): unknown {
  if (typeof value === "string") return value.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "redacted@example.com");
  return value;
}

/**
 * For demo disputes, keep a clean timeline: the "opened" event plus everything
 * from the most recent agent run onward, minus rehearsal resets and test noise.
 */
function cleanDemoEvents(events: Record<string, unknown>[], demoIds: Set<string>): Record<string, unknown>[] {
  const lastRun = new Map<string, number>();
  for (const e of events) if (e.type === "agent:started") lastRun.set(String(e.dispute_id), Number(e.id));
  const noise = /Demo reset|Restored after|automated|e2e test/i;
  return events.filter((e) => {
    const id = String(e.dispute_id);
    if (!demoIds.has(id)) return true;
    if (e.type === "dispute:opened") return true;
    if (noise.test(String(e.detail))) return false;
    return Number(e.id) >= (lastRun.get(id) ?? 0);
  });
}

export function exportSnapshot(db: Database.Database): Snapshot {
  const tables = {} as Snapshot["tables"];
  for (const t of TABLES) {
    const rows = db.prepare(`SELECT * FROM ${t} ${t === "events" ? "ORDER BY id" : ""}`).all() as Record<string, unknown>[];
    tables[t] = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, redact(v)])));
  }
  const demoIds = new Set(tables.disputes.filter((d) => d.source === "demo").map((d) => String(d.id)));
  tables.events = cleanDemoEvents(tables.events, demoIds);
  return { version: 1, createdAt: new Date().toISOString(), tables };
}

/**
 * Loads a snapshot into an empty database. Demo disputes get fresh dates,
 * so their countdowns look the same whenever the server starts.
 */
export function loadSnapshot(db: Database.Database, snap: Snapshot): number {
  const now = Date.now();
  const HOUR = 3_600_000;
  const demoTimes = new Map(
    DEMO_DISPUTES.map((d) => [
      d.id,
      { opened: new Date(now - d.openedDaysAgo * 24 * HOUR).toISOString(), due: new Date(now + d.dueInHours * HOUR).toISOString() },
    ]),
  );

  const insert = (table: Table, row: Record<string, unknown>) => {
    const cols = Object.keys(row);
    db.prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((c) => `@${c}`).join(", ")})`).run(row);
  };

  const tx = db.transaction(() => {
    for (const row of snap.tables.disputes) {
      const t = demoTimes.get(String(row.id));
      insert("disputes", t ? { ...row, opened_at: t.opened, seller_due_at: t.due } : row);
    }
    for (const table of TABLES.filter((x) => x !== "disputes")) {
      for (const row of snap.tables[table] ?? []) {
        // Event and submission IDs are auto-numbered; let SQLite assign new ones.
        const { id: _id, ...rest } = row;
        insert(table, table === "events" || table === "submissions" ? rest : row);
      }
    }
  });
  tx();
  return snap.tables.disputes.length;
}

export function readSnapshotFile(): Snapshot | null {
  if (!existsSync(SNAPSHOT_PATH)) return null;
  try {
    const snap = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as Snapshot;
    return snap.version === 1 ? snap : null;
  } catch {
    return null;
  }
}
