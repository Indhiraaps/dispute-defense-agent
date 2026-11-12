/**
 * Deletes the local database and re-creates it with the three demo disputes.
 * Real sandbox disputes come back with `npm run sync`.
 *   npm run db:reset
 */
import { rmSync } from "node:fs";
import { heading, ok, run } from "./spike/_shared";
import { DB_PATH, getDb } from "../lib/db";
import { listDisputes } from "../lib/db/repo";

run(async () => {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(DB_PATH + suffix, { force: true });
  getDb();
  heading("Database reset with demo data");
  for (const d of listDisputes()) ok(`${d.id}  ${d.claimType}  ${d.amount} ${d.currency}  ${d.itemName}`);
});
