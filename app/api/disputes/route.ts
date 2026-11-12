import { connection } from "next/server";
import { inboxData } from "@/lib/dashboard";

/** GET /api/disputes: inbox rows and summary numbers. The dashboard polls this so webhook updates appear live. */
export async function GET() {
  await connection();
  return Response.json(inboxData(), { headers: { "Cache-Control": "no-store" } });
}
