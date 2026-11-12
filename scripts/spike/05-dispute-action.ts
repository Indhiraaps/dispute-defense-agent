/**
 * Phase 0, step 5: try the other seller actions and the sandbox-only demo controls.
 *
 *   npm run spike:action -- <dispute-id> <action> [amount]
 *
 * Actions:
 *   offer <amount>          make-offer: partial refund, e.g. offer 20.00
 *   accept                  accept-claim: concede the dispute
 *   message                 send-message to the buyer
 *   escalate                escalate the inquiry to a claim
 *   require-seller-evidence sandbox: move to "waiting for seller evidence"
 *   require-buyer-evidence  sandbox: move to "waiting for buyer evidence"
 *   win                     sandbox: adjudicate in the seller's favour
 *   lose                    sandbox: adjudicate in the buyer's favour
 */
import { heading, info, ok, run, saveResult, usage } from "./_shared";
import {
  acceptClaim,
  adjudicate,
  allowedActions,
  escalate,
  getDispute,
  makeOffer,
  requireEvidence,
  sendMessage,
} from "../../lib/paypal/disputes";

const ACTIONS = ["offer", "accept", "message", "escalate", "require-seller-evidence", "require-buyer-evidence", "win", "lose"];

run(async () => {
  const [id, action, amount] = process.argv.slice(2);
  if (!id || !action || !ACTIONS.includes(action)) {
    usage(`Usage: npm run spike:action -- <dispute-id> <${ACTIONS.join("|")}> [amount]`);
  }

  const before = await getDispute(id);
  heading(`Dispute ${id}: ${before.reason}, ${before.status}`);
  info(`Allowed actions: ${allowedActions(before).join(", ") || "none"}`);

  const currency = before.dispute_amount?.currency_code ?? "USD";
  let res;
  switch (action) {
    case "offer":
      if (!amount || !/^\d+\.\d{2}$/.test(amount)) usage("Give an amount like 20.00");
      res = await makeOffer(id, {
        note: "Sorry the colour was not what you expected. We can refund part of the price and you keep the item.",
        amount: { currency_code: currency, value: amount },
      });
      break;
    case "accept":
      res = await acceptClaim(id, { note: "We accept this claim and will refund the buyer." });
      break;
    case "message":
      res = await sendMessage(id, "Hello, we are looking into this and will reply with tracking details shortly.");
      break;
    case "escalate":
      res = await escalate(id, "Escalating to PayPal for review.");
      break;
    case "require-seller-evidence":
      res = await requireEvidence(id, "SELLER_EVIDENCE");
      break;
    case "require-buyer-evidence":
      res = await requireEvidence(id, "BUYER_EVIDENCE");
      break;
    case "win":
      res = await adjudicate(id, "SELLER_FAVOR");
      break;
    case "lose":
      res = await adjudicate(id, "BUYER_FAVOR");
      break;
  }

  ok(`${action} accepted: HTTP ${res!.status}`);
  info(`Saved: ${saveResult(`${action}-${id}`, res!.data)}`);

  const after = await getDispute(id);
  heading(`After: ${after.status}${after.dispute_outcome ? `, outcome ${after.dispute_outcome.outcome_code}` : ""}`);
  info(`Allowed actions now: ${allowedActions(after).join(", ") || "none"}`);
});
