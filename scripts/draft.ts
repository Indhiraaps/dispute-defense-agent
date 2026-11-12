/**
 * Re-scores and re-drafts a dispute from the evidence and analysis already saved
 * (no evidence gathering, so it uses less AI quota than `npm run agent`).
 *   npm run draft -- DEMO-1001
 *   npm run draft            (every dispute that has been through the agent)
 */
import { heading, info, run } from "./spike/_shared";
import { prepareCase } from "../lib/case/prepare";
import { getAnalysis, listDisputes } from "../lib/db/repo";

run(async () => {
  const only = process.argv[2];
  const ids = only ? [only] : listDisputes().filter((d) => d.state !== "RESOLVED" && getAnalysis(d.id)).map((d) => d.id);
  for (const id of ids) {
    heading(`=== ${id}`);
    const c = await prepareCase(id, (l) => info(l));
    for (const r of c.score.rules) info(`  ${r.met ? "✔" : "·"} ${String(r.points).padStart(3)}  ${r.label}${r.cites.length ? ` [${r.cites.join(", ")}]` : ""}`);
    heading(`Draft (${c.draft.audience === "buyer" ? "to the buyer" : "to PayPal"}${c.draft.evidenceType ? `, evidence type ${c.draft.evidenceType}` : ""}):`);
    console.log(`  ${c.draft.text}`);
    for (const p of c.draft.check.problems) info(`  problem: #${p.sentence} ${p.issue}`);
    for (const r of c.draft.removed) info(`  removed: ${r}`);
    if (c.score.advice.length) info(`Advice for the seller: ${c.score.advice.join(" ")}`);
  }
});
