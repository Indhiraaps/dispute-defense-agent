/**
 * Runs once when the server starts. Opens the database (which loads the
 * snapshot on a fresh disk), then refreshes the real PayPal disputes in the
 * background so the server is ready straight away.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getDb } = await import("./lib/db");
  getDb();
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) return;
  const { syncAllDisputes } = await import("./lib/paypal/import");
  syncAllDisputes()
    .then((r) => console.log(`[startup] refreshed ${r.length} PayPal dispute(s) from the sandbox`))
    .catch((err) => console.error(`[startup] PayPal refresh failed: ${(err as Error).message.split("\n")[0]}`));
}
