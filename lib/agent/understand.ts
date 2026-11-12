import { generateText, Output } from "ai";
import { z } from "zod";
import { CLAIM_LABEL } from "../claims";
import { CALL_SETTINGS, withModelFallback } from "../llm/model";
import type { DisputeRow } from "../types";
import type { ComplaintSummary } from "./types";

/** Step 2 of the flow: a plain-English summary of what the buyer is claiming. */

const schema = z.object({
  summary: z
    .string()
    .describe("One plain sentence, at most 30 words, saying what the buyer claims. Example: 'Buyer says the scarf never arrived and wants a full refund.'"),
  buyerWants: z.enum(["full_refund", "partial_refund", "replacement", "item_delivery", "information", "unclear"]),
  keyQuestion: z
    .string()
    .describe("The one factual question the evidence must answer, e.g. 'Was the parcel delivered to the buyer's address?'"),
});

const INSTRUCTIONS = `You summarise PayPal buyer disputes for a small seller. Be neutral: do not assume either side is right.
Use only the information given. Refer to the buyer as "the buyer", never by name.`;

export async function understandComplaint(d: DisputeRow): Promise<{ summary: ComplaintSummary; modelId: string }> {
  const prompt = [
    `Claim type: ${CLAIM_LABEL[d.claimType]} (PayPal reason ${d.reason}).`,
    `Item: ${d.itemName || "unknown"}. Amount: ${d.amount} ${d.currency}.`,
    `Buyer's words: "${d.buyerClaim || "(none given)"}"`,
  ].join("\n");

  const res = await withModelFallback("complaint summary", async (model) => {
    const { output } = await generateText({
      model,
      instructions: INSTRUCTIONS,
      prompt,
      output: Output.object({ schema }),
      ...CALL_SETTINGS,
    });
    return output;
  });
  return { summary: res.value, modelId: res.modelId };
}

/** Used when no AI model is reachable, so the page still has something honest to show. */
export function fallbackSummary(d: DisputeRow): ComplaintSummary {
  return {
    summary: d.buyerClaim ? `Buyer says: "${d.buyerClaim}"` : `${CLAIM_LABEL[d.claimType]} claim for ${d.amount} ${d.currency}.`,
    buyerWants: "unclear",
    keyQuestion:
      d.claimType === "INR"
        ? "Was the item delivered to the buyer's address?"
        : d.claimType === "SNAD"
          ? "Does the item match the listing?"
          : "Is there evidence the buyer authorised or received this?",
  };
}
