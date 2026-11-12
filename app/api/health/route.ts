import { connection } from "next/server";

/** Liveness check for Render. Reports which settings are present, never their values. */
export async function GET() {
  await connection();
  return Response.json({
    ok: true,
    paypal: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
    webhookId: Boolean(process.env.PAYPAL_WEBHOOK_ID),
    gemini: Boolean(process.env.GEMINI_API_KEY),
  });
}
