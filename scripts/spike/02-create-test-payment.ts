/**
 * Phase 0, step 2: make a real sandbox payment that the sandbox buyer can then dispute.
 *   npm run spike:payment -- 120.00 "Hand-block printed scarf"
 *
 * Opens nothing by itself: it prints a link. Log in with the PERSONAL (buyer)
 * sandbox account, approve, and this script captures the payment.
 */
import { heading, info, ok, run, saveResult } from "./_shared";
import { approvalLink, captureOrder, createCaptureOrder, getOrder } from "../../lib/paypal/orders";

const POLL_MS = 4000;
const TIMEOUT_MS = 15 * 60 * 1000;

run(async () => {
  const amount = process.argv[2] ?? "120.00";
  const description = process.argv[3] ?? "Hand-block printed scarf";
  if (!/^\d+\.\d{2}$/.test(amount)) throw new Error(`Amount must look like 120.00, got "${amount}"`);

  const appUrl = process.env.APP_BASE_URL || "http://localhost:3000";
  const ref = `test-${Date.now()}`;
  const { data: order } = await createCaptureOrder({
    amount,
    description,
    referenceId: ref,
    returnUrl: `${appUrl}/spike/approved`,
    cancelUrl: `${appUrl}/spike/approved?cancelled=1`,
  });
  const link = approvalLink(order);
  heading(`Created sandbox order ${order.id} for $${amount} (${description})`);
  console.log(`\nOpen this link and pay with the PERSONAL sandbox buyer account:\n\n  ${link}\n`);
  info("Waiting for approval (up to 15 minutes)...");

  const started = Date.now();
  let status = order.status;
  while (status !== "APPROVED") {
    if (Date.now() - started > TIMEOUT_MS) throw new Error("Timed out waiting for the buyer to approve.");
    await new Promise((r) => setTimeout(r, POLL_MS));
    status = (await getOrder(order.id)).status;
    if (status === "COMPLETED") break;
  }

  const captured = status === "COMPLETED" ? await getOrder(order.id) : await captureOrder(order.id);
  const capture = captured.purchase_units?.[0]?.payments?.captures?.[0];
  ok(`Payment captured. Capture (transaction) ID: ${capture?.id} (${capture?.status})`);
  info(`Saved: ${saveResult("payment", captured)}`);

  heading("Next: open a dispute as the buyer");
  info("1. Go to https://www.sandbox.paypal.com and log in as the PERSONAL sandbox buyer.");
  info("2. Open the Resolution Center (https://www.sandbox.paypal.com/disputes/) and report a problem");
  info(`   with this payment ($${amount}). Choose "item not received" or "not as described".`);
  info("3. Then run: npm run spike:inspect   (lists the seller's disputes)");
});
