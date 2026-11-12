/**
 * Phase 0, step 1: check that the PayPal sandbox and Gemini keys work.
 *   npm run spike:keys
 */
import { bad, describeError, heading, info, ok, run } from "./_shared";
import { getAccessToken } from "../../lib/paypal/client";
import { listDisputes } from "../../lib/paypal/disputes";
import { geminiModel, geminiModels, geminiTextWithModel } from "../../lib/llm/gemini";

const DISPUTE_SCOPES = [
  "https://uri.paypal.com/services/disputes/read-seller",
  "https://uri.paypal.com/services/disputes/update-seller",
];

run(async () => {
  let failures = 0;

  heading("1. Settings in .env");
  for (const name of ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID", "GEMINI_API_KEY"]) {
    if (process.env[name]) ok(`${name} is set`);
    else {
      bad(`${name} is empty`);
      if (name !== "PAYPAL_WEBHOOK_ID") failures++;
    }
  }

  heading("2. PayPal sandbox login");
  try {
    const { scope } = await getAccessToken();
    ok("Got an access token from the sandbox");
    for (const s of DISPUTE_SCOPES) {
      if (scope.includes(s)) ok(`Token has ${s.split("/").pop()}`);
      else {
        bad(`Token is missing ${s.split("/").pop()}. Enable Disputes for this app on developer.paypal.com.`);
        failures++;
      }
    }
  } catch (err) {
    bad(describeError(err));
    failures++;
  }

  heading("3. PayPal Disputes API");
  try {
    const items = await listDisputes({ page_size: 10 });
    ok(`List disputes works (${items.length} found on the seller account)`);
    for (const d of items) info(`${d.dispute_id}  ${d.reason}  ${d.status}  ${d.dispute_amount?.value ?? ""}`);
  } catch (err) {
    bad(describeError(err));
    failures++;
  }

  heading(`4. Gemini (main: ${geminiModel()}; backups: ${geminiModels().slice(1).join(", ") || "none"})`);
  try {
    const { text, model } = await geminiTextWithModel("Reply with exactly one word: ready");
    ok(`Gemini replied: "${text}" (model ${model})`);
    if (model !== geminiModel()) info("The main model was busy, so a backup answered. That's fine.");
  } catch (err) {
    bad(describeError(err));
    failures++;
  }

  heading(failures === 0 ? "All checks passed." : `${failures} check(s) failed. Fix them before the next step.`);
  if (failures) process.exit(1);
});
