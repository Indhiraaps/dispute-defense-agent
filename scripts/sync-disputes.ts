/**
 * Pulls all disputes from the PayPal sandbox into the local database and
 * collects evidence for new ones.
 *   npm run sync
 */
import { heading, info, ok, run } from "./spike/_shared";
import { syncAllDisputes } from "../lib/paypal/import";

run(async () => {
  const results = await syncAllDisputes();
  heading(`Synced ${results.length} dispute(s) from the PayPal sandbox`);
  for (const r of results) ok(`${r.id}  ${r.status}${r.isNew ? "  (new, evidence collected)" : ""}`);
  if (results.length === 0) info("No disputes on the sandbox seller account yet.");
});
