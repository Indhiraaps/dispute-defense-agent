/**
 * Saves the current database (evidence, agent analysis, drafts, timelines) to
 * seed/snapshot.json, which a fresh server loads on start. Run it after a good
 * agent run and `npm run demo:reset`, then commit the file.
 *   npm run snapshot
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { heading, info, ok, run } from "./spike/_shared";
import { getDb } from "../lib/db";
import { exportSnapshot, SNAPSHOT_PATH } from "../lib/seed/snapshot";

run(async () => {
  const snap = exportSnapshot(getDb());
  mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(snap, null, 1));
  heading("Snapshot saved");
  ok(path.relative(process.cwd(), SNAPSHOT_PATH));
  for (const [table, rows] of Object.entries(snap.tables)) info(`${table.padEnd(12)} ${rows.length}`);
});
