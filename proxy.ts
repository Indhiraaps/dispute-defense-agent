import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional site password. When APP_PASSWORD is set, every page and action asks
 * for it (browser sign-in box, any username). The deployed app can send things
 * to PayPal and spend Gemini quota, so it shouldn't be open to anyone with the URL.
 *
 * Left open on purpose: PayPal's webhook (it verifies its own signature) and
 * the health check Render uses.
 */
const OPEN_PATHS = ["/api/webhooks/paypal", "/api/health"];

export function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();
  if (OPEN_PATHS.some((p) => request.nextUrl.pathname.startsWith(p))) return NextResponse.next();

  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const given = decoded.slice(decoded.indexOf(":") + 1);
      if (given.length === password.length && given === password) return NextResponse.next();
    } catch {
      // malformed header: fall through to the challenge
    }
  }
  return new NextResponse("Password required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Dispute Defense Agent", charset="UTF-8"' },
  });
}

export const config = {
  // Everything except Next.js build assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
