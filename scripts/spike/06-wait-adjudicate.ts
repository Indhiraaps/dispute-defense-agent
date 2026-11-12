/**
 * Retries the sandbox "seller wins" decision every 2 minutes (up to 30 minutes),
 * because PayPal takes a while to process a claim before it can be decided.
 *   npm run spike:wait-decision -- PP-R-XXXX
 */
import { describeError, info, ok, run, usage } from "./_shared";
import { PayPalError } from "../../lib/paypal/client";
import { adjudicate, allowedActions, getDispute } from "../../lib/paypal/disputes";
import { importDispute } from "../../lib/paypal/import";
import { getOutcome } from "../../lib/db/repo";

run(async () => {
  const id = process.argv[2];
  if (!id) usage("Usage: npm run spike:wait-decision -- <dispute-id>");
  for (let attempt = 1; attempt <= 15; attempt++) {
    const d = await getDispute(id);
    const stamp = new Date().toLocaleTimeString();
    info(`${stamp} attempt ${attempt}: ${d.status} / ${d.dispute_state} / ${d.dispute_life_cycle_stage}; links: ${allowedActions(d).join(", ") || "none"}`);
    if (d.status === "RESOLVED") {
      await importDispute(id, "resolved while waiting");
      ok(`Already resolved: ${d.dispute_outcome?.outcome_code}`);
      return;
    }
    try {
      await adjudicate(id, "SELLER_FAVOR");
      const after = await importDispute(id, "sandbox decision: seller favour");
      ok(`Decision accepted on attempt ${attempt}. PayPal status: ${after.status}`);
      info(`Recorded outcome: ${JSON.stringify(getOutcome(id))}`);
      return;
    } catch (err) {
      info(`  refused: ${err instanceof PayPalError ? (err.body as { details?: { issue?: string }[] })?.details?.[0]?.issue ?? err.status : describeError(err)}`);
    }
    if (attempt < 15) await new Promise((r) => setTimeout(r, 120_000));
  }
  info("Still not allowed after 30 minutes. Try again later with: npm run spike:action -- <id> win");
});
