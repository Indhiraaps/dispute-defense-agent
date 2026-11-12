import { randomUUID } from "node:crypto";

/** The only PayPal host this app will ever call. Live money is out of scope. */
export const PAYPAL_SANDBOX_BASE = "https://api-m.sandbox.paypal.com";

export class PayPalError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly debugId: string | undefined,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "PayPalError";
  }

  /** A readable one-paragraph explanation, including PayPal's field-level details. */
  describe(): string {
    const b = this.body as
      | { name?: string; message?: string; details?: { field?: string; issue?: string; description?: string }[] }
      | undefined;
    const lines = [`HTTP ${this.status} ${b?.name ?? ""} ${b?.message ?? this.message}`.trim()];
    for (const d of b?.details ?? []) {
      lines.push(`  - ${d.issue ?? ""}${d.field ? ` (field: ${d.field})` : ""}${d.description ? `: ${d.description}` : ""}`);
    }
    if (this.debugId) lines.push(`  debug_id: ${this.debugId}`);
    return lines.join("\n");
  }
}

function credentials() {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set in .env (sandbox app credentials).");
  }
  return { id, secret };
}

type TokenCache = { token: string; scope: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

/** OAuth client-credentials token, cached until one minute before it expires. */
export async function getAccessToken(): Promise<TokenCache> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache;
  const { id, secret } = credentials();
  const res = await fetch(`${PAYPAL_SANDBOX_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new PayPalError(
      "Could not get a PayPal access token. Check the sandbox client ID and secret.",
      res.status,
      res.headers.get("paypal-debug-id") ?? undefined,
      body,
    );
  }
  tokenCache = {
    token: body.access_token,
    scope: body.scope ?? "",
    expiresAt: Date.now() + (Number(body.expires_in ?? 0) - 60) * 1000,
  };
  return tokenCache;
}

export type PayPalResponse<T> = { data: T; status: number; debugId?: string };

type RequestOptions = {
  query?: Record<string, string | number | undefined>;
  json?: unknown;
  form?: FormData;
  /** Idempotency key. A fresh UUID is used for every POST unless one is given. */
  requestId?: string;
};

/** Calls the PayPal sandbox REST API and throws PayPalError on any non-2xx response. */
export async function paypalRequest<T = unknown>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  opts: RequestOptions = {},
): Promise<PayPalResponse<T>> {
  const { token } = await getAccessToken();
  const url = new URL(path, PAYPAL_SANDBOX_BASE);
  if (url.origin !== PAYPAL_SANDBOX_BASE) throw new Error(`Refusing to call non-sandbox host: ${url.origin}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form; // fetch sets the multipart boundary itself
  } else if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  }
  if (method !== "GET") headers["PayPal-Request-Id"] = opts.requestId ?? randomUUID();

  const res = await fetch(url, { method, headers, body });
  const debugId = res.headers.get("paypal-debug-id") ?? undefined;
  const text = await res.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // keep the raw text
  }
  if (!res.ok) {
    throw new PayPalError(`PayPal ${method} ${url.pathname} failed`, res.status, debugId, data);
  }
  return { data: data as T, status: res.status, debugId };
}
