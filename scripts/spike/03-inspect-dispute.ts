/**
 * Phase 0, step 3: see the seller's disputes, or one dispute in detail.
 *   npm run spike:inspect                 (list all)
 *   npm run spike:inspect -- PP-D-12345   (one, with the actions PayPal allows right now)
 */
import { heading, info, ok, run, saveResult } from "./_shared";
import { allowedActions, getDispute, listDisputes } from "../../lib/paypal/disputes";

run(async () => {
  const id = process.argv[2];

  if (!id) {
    const items = await listDisputes({ page_size: 50 });
    heading(`${items.length} dispute(s) on the seller account`);
    for (const d of items) {
      console.log(
        `  ${d.dispute_id.padEnd(16)} ${(d.reason ?? "").padEnd(32)} ${(d.status ?? "").padEnd(30)} ${d.dispute_amount?.value ?? ""} ${d.dispute_amount?.currency_code ?? ""}`,
      );
    }
    if (items.length === 0) info("None yet. A new buyer dispute can take a minute or two to appear.");
    else info("Run again with an ID to see details, e.g. npm run spike:inspect -- " + items[0].dispute_id);
    return;
  }

  const d = await getDispute(id);
  const file = saveResult(`dispute-${id}`, d);
  heading(`Dispute ${d.dispute_id}`);
  info(`Reason:          ${d.reason}`);
  info(`Status:          ${d.status}${d.dispute_state ? ` (${d.dispute_state})` : ""}`);
  info(`Stage:           ${d.dispute_life_cycle_stage ?? "-"}  channel: ${d.dispute_channel ?? "-"}`);
  info(`Amount:          ${d.dispute_amount?.value} ${d.dispute_amount?.currency_code}`);
  info(`Seller due by:   ${d.seller_response_due_date ?? "-"}`);
  const tx = d.disputed_transactions?.[0];
  if (tx) {
    info(`Transaction:     ${tx.seller_transaction_id ?? "-"}  ${tx.gross_amount?.value ?? ""}`);
    for (const item of tx.items ?? []) info(`Item:            ${item.item_name ?? item.item_description ?? "-"}`);
  }
  for (const m of d.messages ?? []) info(`Message (${m.posted_by}): ${m.content ?? ""}`);
  if (d.dispute_outcome) info(`Outcome:         ${d.dispute_outcome.outcome_code}`);

  heading("Actions PayPal allows right now");
  const actions = allowedActions(d);
  if (actions.length === 0) info("None (the dispute may be closed or waiting on the buyer).");
  for (const a of actions) ok(a);
  info(`\nFull response saved to ${file}`);
});
