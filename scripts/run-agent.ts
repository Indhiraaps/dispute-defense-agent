/**
 * Runs the AI agent on one dispute, or on every open dispute.
 *   npm run agent -- DEMO-1002
 *   npm run agent
 */
import { heading, info, run } from "./spike/_shared";
import { listDisputes, listEvidence } from "../lib/db/repo";
import { runAgent } from "../lib/agent/run";
import { prepareCase } from "../lib/case/prepare";

run(async () => {
  const only = process.argv[2];
  const ids = only ? [only] : listDisputes().filter((d) => d.state !== "RESOLVED").map((d) => d.id);
  for (const id of ids) {
    heading(`=== ${id}`);
    const started = Date.now();
    const a = await runAgent(id, (line) => info(line));
    info(`Models: ${Object.entries(a.models).map(([k, v]) => `${k}=${v}`).join(", ")}`);
    info(`Agent's note: ${a.gatheringNote}`);
    for (const s of a.steps) info(`  ${s.step}. ${s.tool}${s.saved.length ? ` → ${s.saved.join(", ")}` : ""}${s.input.why ? `  (${s.input.why})` : ""}`);
    for (const f of a.messageFindings) info(`  ${f.evidenceId} ${f.signal}: "${f.quote}"`);
    if (a.photoFinding) {
      const p = a.photoFinding;
      info(`  Photos (${p.citedIds.join(", ")}): ${p.verdict}, confidence ${p.confidence}`);
      info(`    listing: ${p.listingShows}`);
      info(`    buyer:   ${p.buyerPhotoShows}`);
      info(`    factors: ${p.factors}`);
    }
    const c = await prepareCase(id, (line) => info(line));
    info(`Draft: ${c.draft.text}`);
    info(`Evidence records: ${listEvidence(id).length}. Took ${((Date.now() - started) / 1000).toFixed(1)}s`);
  }
});
