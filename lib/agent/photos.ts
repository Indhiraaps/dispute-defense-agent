import { readFile } from "node:fs/promises";
import path from "node:path";
import { generateText, Output, type ModelMessage } from "ai";
import { z } from "zod";
import { CALL_SETTINGS, withModelFallback } from "../llm/model";
import type { EvidenceRecord } from "../types";
import type { PhotoFinding } from "./types";

/**
 * Step 3c: Gemini vision compares the seller's photos (listing or packing)
 * with the buyer's photos. It reports what it sees, and how lighting or the
 * camera could explain a difference. It does not decide the dispute.
 */

const schema = z.object({
  attribute: z.string().describe("The attribute in dispute, e.g. 'colour'"),
  listingShows: z.string().describe("What the seller's photos show for that attribute"),
  buyerPhotoShows: z.string().describe("What the buyer's photos show for that attribute"),
  verdict: z.enum(["consistent", "inconsistent", "unclear"]).describe(
    "consistent: same item, any difference is explained by lighting or camera. inconsistent: clearly a different attribute. unclear: the photos can't settle it.",
  ),
  factors: z.string().describe("Lighting, white balance, angle or camera issues that affect the comparison"),
  confidence: z.number().describe("0 to 1"),
  citedIds: z.array(z.string()).describe("The photo IDs you relied on, e.g. IMG-001"),
});

const INSTRUCTIONS = `You are an impartial photo examiner for a PayPal "not as described" dispute.
Compare the seller's photos with the buyer's photos for the attribute the buyer complains about.
Judge only what is visible. Consider lighting, white balance, shadows and camera exposure before calling something a different colour.
If the photos cannot settle the question, say "unclear" and lower your confidence. Do not guess.`;

export async function comparePhotos(args: {
  photos: EvidenceRecord[];
  listing: EvidenceRecord | undefined;
  buyerClaim: string;
}): Promise<{ finding: PhotoFinding; modelId: string } | null> {
  const reference = args.photos.filter((p) => p.facts.who !== "buyer");
  const buyer = args.photos.filter((p) => p.facts.who === "buyer");
  if (reference.length === 0 || buyer.length === 0) return null; // nothing to compare

  const content: Exclude<ModelMessage["content"], string> = [
    {
      type: "text",
      text: [
        `Buyer's complaint: "${args.buyerClaim}"`,
        args.listing ? `Listing record ${args.listing.id}: ${args.listing.text}` : "",
        "The photos follow, each introduced by its ID.",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
  for (const p of [...reference, ...buyer]) {
    const file = path.join(process.cwd(), "public", String(p.facts.path));
    content.push({ type: "text", text: `[${p.id}] ${p.text}` });
    content.push({ type: "file", mediaType: "image/png", data: await readFile(file) });
  }

  const res = await withModelFallback("photo comparison", async (model) => {
    const { output } = await generateText({
      model,
      instructions: INSTRUCTIONS,
      messages: [{ role: "user", content } as ModelMessage],
      output: Output.object({ schema }),
      ...CALL_SETTINGS,
    });
    return output;
  });

  // Only keep citations to photos that exist.
  const ids = new Set(args.photos.map((p) => p.id));
  const cited = res.value.citedIds.filter((id) => ids.has(id));
  const finding: PhotoFinding = {
    ...res.value,
    confidence: Math.max(0, Math.min(1, res.value.confidence)),
    citedIds: cited.length ? cited : [...ids],
  };
  return { finding, modelId: res.modelId };
}
