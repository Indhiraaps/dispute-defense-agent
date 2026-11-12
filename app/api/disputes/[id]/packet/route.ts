import { buildEvidencePacket } from "@/lib/pdf/packet";

/** GET /api/disputes/:id/packet: the evidence PDF, built fresh from the current draft and records. */
export async function GET(_req: Request, ctx: RouteContext<"/api/disputes/[id]/packet">) {
  const { id } = await ctx.params;
  try {
    const packet = await buildEvidencePacket(decodeURIComponent(id));
    return new Response(Buffer.from(packet.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${packet.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 404 });
  }
}
