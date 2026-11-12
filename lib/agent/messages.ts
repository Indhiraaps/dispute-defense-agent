import { generateText, Output } from "ai";
import { z } from "zod";
import { CALL_SETTINGS, withModelFallback } from "../llm/model";
import type { EvidenceRecord } from "../types";
import { MESSAGE_SIGNALS, type MessageFinding } from "./types";

/**
 * Step 3b: find statements in the buyer–seller messages that matter, such as
 * "got it, thanks" or the seller admitting a mistake. Each finding must name a
 * real message ID and quote it word for word, or it is thrown out.
 */

const schema = z.object({
  findings: z.array(
    z.object({
      evidenceId: z.string().describe("The message ID, e.g. MSG-001"),
      signal: z.enum(MESSAGE_SIGNALS),
      quote: z.string().describe("The exact words from that message, copied character for character"),
      explanation: z.string().describe("One short sentence on why this matters for the dispute"),
    }),
  ),
});

const INSTRUCTIONS = `You read the messages between a buyer and a seller in a PayPal dispute and pick out statements that matter.
Signals:
- BUYER_CONFIRMS_RECEIPT: the buyer says the item arrived.
- BUYER_ACCEPTS_ITEM: the buyer says they are happy with or keep the item.
- BUYER_REPORTS_PROBLEM: the buyer describes something wrong with the item or delivery.
- BUYER_REQUESTS_REFUND: the buyer asks for money back.
- SELLER_ADMITS_FAULT: the seller admits a defect, mistake or not shipping.
- SELLER_OFFERS_HELP: the seller offers a fix, replacement, refund or asks for information to help.
Rules: quote exactly, never paraphrase inside "quote". Only use the message IDs given. If nothing matters, return an empty list.`;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();

/** Keeps only findings whose ID is a message and whose quote really appears in it. */
export function checkFindings(
  findings: MessageFinding[],
  messages: EvidenceRecord[],
): { kept: MessageFinding[]; rejected: number } {
  const byId = new Map(messages.map((m) => [m.id, norm(String(m.facts.text ?? ""))]));
  const kept: MessageFinding[] = [];
  let rejected = 0;
  for (const f of findings) {
    const text = byId.get(f.evidenceId);
    const quote = norm(f.quote.replace(/^["']|["']$/g, ""));
    if (text && quote.length >= 3 && text.includes(quote)) kept.push(f);
    else rejected++;
  }
  return { kept, rejected };
}

export async function analyzeMessages(
  messages: EvidenceRecord[],
): Promise<{ findings: MessageFinding[]; rejected: number; modelId: string }> {
  if (messages.length === 0) return { findings: [], rejected: 0, modelId: "none needed" };
  const prompt = messages
    .map((m) => `[${m.id}] ${m.facts.from === "seller" ? "SELLER" : "BUYER"} on ${m.facts.date}: ${m.facts.text}`)
    .join("\n");

  const res = await withModelFallback("message analysis", async (model) => {
    const { output } = await generateText({
      model,
      instructions: INSTRUCTIONS,
      prompt,
      output: Output.object({ schema }),
      ...CALL_SETTINGS,
    });
    return output.findings;
  });
  const { kept, rejected } = checkFindings(res.value, messages);
  return { findings: kept, rejected, modelId: res.modelId };
}
