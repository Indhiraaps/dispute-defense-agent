import { after } from "next/server";
import { logWebhookEvent } from "@/lib/events";
import { importDispute } from "@/lib/paypal/import";
import { verifyWebhookSignature, type WebhookEvent } from "@/lib/paypal/webhooks";

const DISPUTE_EVENTS = new Set(["CUSTOMER.DISPUTE.CREATED", "CUSTOMER.DISPUTE.UPDATED", "CUSTOMER.DISPUTE.RESOLVED"]);

/**
 * PayPal webhook receiver. Every event is verified with PayPal before it is
 * trusted. Dispute events are imported after the response is sent, so PayPal
 * gets a fast 200.
 */
export async function POST(request: Request) {
  let event: WebhookEvent;
  try {
    event = JSON.parse(await request.text());
  } catch {
    return Response.json({ error: "Body is not valid JSON" }, { status: 400 });
  }

  const skip = process.env.WEBHOOK_SKIP_VERIFY === "true" && process.env.NODE_ENV !== "production";
  let verified = false;
  if (!skip) {
    try {
      verified = await verifyWebhookSignature(request.headers, event);
    } catch (err) {
      console.error("Webhook verification error:", err);
      return Response.json({ error: "Could not verify webhook" }, { status: 500 });
    }
    if (!verified) return Response.json({ error: "Signature check failed" }, { status: 401 });
  }

  await logWebhookEvent(event, verified);
  console.log(`Webhook ${event.event_type} ${event.id}${skip ? " (verification skipped)" : ""}`);

  const disputeId = event.resource?.dispute_id;
  if (DISPUTE_EVENTS.has(event.event_type) && typeof disputeId === "string") {
    after(async () => {
      try {
        // Re-fetch the full dispute rather than trusting the webhook body's copy.
        await importDispute(disputeId, `webhook ${event.event_type}`);
      } catch (err) {
        console.error(`Could not import dispute ${disputeId}:`, err);
      }
    });
  }

  return Response.json({ received: true });
}
