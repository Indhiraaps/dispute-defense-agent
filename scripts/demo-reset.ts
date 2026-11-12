/**
 * Puts the demo disputes back to "needs your approval" for another rehearsal,
 * keeping the agent's evidence, analysis and drafts (so no AI quota is used).
 * Real PayPal disputes are not touched.
 *   npm run demo:reset
 */
import { heading, ok, run } from "./spike/_shared";
import { getDb } from "../lib/db";
import { getCaseFile, listDisputes, saveCaseFile, setState } from "../lib/db/repo";

run(async () => {
  const db = getDb();
  heading("Resetting demo disputes");
  for (const d of listDisputes().filter((x) => x.source === "demo")) {
    db.prepare("DELETE FROM submissions WHERE dispute_id = ?").run(d.id);
    db.prepare("DELETE FROM outcomes WHERE dispute_id = ?").run(d.id);
    db.prepare("UPDATE disputes SET paypal_status = 'WAITING_FOR_SELLER_RESPONSE', outcome = NULL WHERE id = ?").run(d.id);
    const file = getCaseFile(d.id);
    if (file) saveCaseFile({ ...file, approval: null, updatedAt: new Date().toISOString() });
    setState(d.id, file ? "AWAITING_APPROVAL" : "NEW", "Demo reset for another rehearsal");
    ok(`${d.id}  ${file ? "needs your approval" : "new (run the agent)"}`);
  }
});
