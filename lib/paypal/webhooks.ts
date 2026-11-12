import { paypalRequest } from "./client";

export type WebhookEvent = {
  id: string;
  event_type: string;
  create_time?: string;
  resource_type?: string;
  summary?: string;
  resource?: Record<string, unknown>;
};

const HEADER_NAMES = {
  auth_algo: "paypal-auth-algo",
  cert_url: "paypal-cert-url",
  transmission_id: "paypal-transmission-id",
  transmission_sig: "paypal-transmission-sig",
  transmission_time: "paypal-transmission-time",
} as const;

/**
 * Asks PayPal whether this webhook really came from PayPal.
 * Returns false for missing headers or a failed check. Throws if PAYPAL_WEBHOOK_ID is unset.
 */
export async function verifyWebhookSignature(headers: Headers, event: WebhookEvent): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw new Error("PAYPAL_WEBHOOK_ID is not set, so webhooks cannot be verified.");

  const fields: Record<string, string> = {};
  for (const [field, header] of Object.entries(HEADER_NAMES)) {
    const value = headers.get(header);
    if (!value) return false;
    fields[field] = value;
  }

  const res = await paypalRequest<{ verification_status?: string }>(
    "POST",
    "/v1/notifications/verify-webhook-signature",
    { json: { ...fields, webhook_id: webhookId, webhook_event: event } },
  );
  return res.data.verification_status === "SUCCESS";
}
