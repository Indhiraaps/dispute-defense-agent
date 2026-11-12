/**
 * Collects evidence for one dispute, or all of them, and prints each record.
 *   npm run collect                 (every dispute)
 *   npm run collect -- DEMO-1001    (one dispute)
 */
import { heading, info, run } from "./spike/_shared";
import { listDisputes } from "../lib/db/repo";
import { collectEvidence } from "../lib/evidence/collect";

run(async () => {
  const only = process.argv[2];
  const ids = only ? [only] : listDisputes().map((d) => d.id);
  for (const id of ids) {
    const { records, missing } = await collectEvidence(id);
    heading(`${id}: ${records.length} record(s)`);
    for (const r of records) console.log(`  [${r.id}] ${r.text}`);
    for (const m of missing) info(`missing: ${m}`);
  }
});
