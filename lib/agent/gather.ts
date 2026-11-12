import { generateText, hasToolCall, isStepCount, tool, type ToolSet } from "ai";
import { z } from "zod";
import { CLAIM_LABEL } from "../claims";
import { addEvent } from "../db/repo";
import { collectEvidence } from "../evidence/collect";
import { CALL_SETTINGS, withModelFallback } from "../llm/model";
import { allowedActions, getDispute as getPayPalDispute } from "../paypal/disputes";
import type { ClaimType, DisputeRow, EvidenceKind } from "../types";
import type { AgentStep, ComplaintSummary } from "./types";

/**
 * Step 3 of the flow: the agent decides which records to fetch for this claim
 * and keeps going until it has enough. Every tool only reads; nothing here
 * can change anything at PayPal.
 */

/** What each claim type needs. Used as the safety net and as the no-AI fallback. */
export const REQUIRED_KINDS: Record<ClaimType, EvidenceKind[]> = {
  INR: ["payment", "order", "tracking", "delivery", "message", "policy"],
  SNAD: ["payment", "order", "tracking", "delivery", "listing", "photo", "message", "policy"],
  UNAUTHORIZED: ["payment", "order", "tracking", "delivery", "message"],
  OTHER: ["payment", "order", "tracking", "delivery", "listing", "photo", "message", "policy"],
};

const TOOL_KINDS: Record<string, { kinds: EvidenceKind[]; description: string }> = {
  get_payment: { kinds: ["payment"], description: "The PayPal payment record: transaction ID, amount, date, buyer country." },
  get_order: { kinds: ["order"], description: "The order: items, quantity, shipping address (city and postcode), shipped date." },
  get_tracking: {
    kinds: ["tracking", "delivery"],
    description: "Carrier tracking and delivery status for the order, including whether the address matches and any signature.",
  },
  get_listing: {
    kinds: ["listing"],
    description: "The product listing as it was at the time of sale: title, description, colour, size, material.",
  },
  get_photos: { kinds: ["photo"], description: "Photos: the listing photo, seller packing photos and the buyer's photos." },
  get_messages: { kinds: ["message"], description: "Every message between buyer and seller about this order." },
  get_policy: { kinds: ["policy"], description: "The seller's published returns and shipping policy." },
};

const INSTRUCTIONS = `You are the evidence-gathering step of a dispute agent that helps a small PayPal seller respond honestly to a buyer dispute.
Your job is only to fetch records. You do not argue the case or decide the outcome.

How to work:
- Think about what this claim type needs, then call ALL the tools you need together in your first step (parallel calls). Use a second step only if a result shows you need something more.
- Item not received: payment, order, tracking/delivery and messages matter most.
- Not as described: the listing, photos and messages matter most, plus payment, order and delivery.
- Call each tool at most once. Never invent facts; only the tools provide facts.
- When you have what this claim needs, or a tool tells you something is missing and cannot be found, call finish_gathering with a one-sentence note.`;

export type GatherResult = { steps: AgentStep[]; note: string; modelId: string };

export async function gatherEvidence(d: DisputeRow, summary: ComplaintSummary | null): Promise<GatherResult> {
  const steps: AgentStep[] = [];
  // Results already fetched in this run. If a model fails midway, the backup model
  // gets these back instantly instead of the work being repeated or lost.
  const fetchedResults = new Map<string, unknown>();

  const record = (toolName: string, input: Record<string, unknown>, saved: string[], missing: string[]) => {
    steps.push({ step: steps.length + 1, tool: toolName, input, saved, missing });
    addEvent(d.id, "agent:tool", `${toolName}${saved.length ? ` → ${saved.join(", ")}` : ""}${missing.length ? ` (missing: ${missing.join(" ")})` : ""}`);
  };

  const buildTools = () => {
    const tools: ToolSet = {};
    for (const [name, spec] of Object.entries(TOOL_KINDS)) {
      tools[name] = tool({
        description: spec.description,
        inputSchema: z.object({ why: z.string().describe("One short sentence: why this record matters for this claim") }),
        execute: async ({ why }) => {
          if (fetchedResults.has(name)) return fetchedResults.get(name);
          const r = await collectEvidence(d.id, spec.kinds);
          record(name, { why }, r.records.map((x) => x.id), r.missing);
          const out = { saved: r.records.map((x) => ({ id: x.id, fact: x.text })), missing: r.missing };
          fetchedResults.set(name, out);
          return out;
        },
      });
    }
    if (d.source === "paypal") {
      tools.check_paypal_status = tool({
        description: "Current status of this dispute at PayPal: stage, status and which seller actions PayPal allows right now.",
        inputSchema: z.object({}),
        execute: async () => {
          const p = await getPayPalDispute(d.id);
          const out = {
            status: p.status,
            stage: p.dispute_life_cycle_stage,
            seller_response_due: p.seller_response_due_date ?? null,
            allowed_actions: allowedActions(p),
          };
          record("check_paypal_status", {}, [], []);
          return out;
        },
      });
    }
    tools.finish_gathering = tool({
      description: "Call when you have enough evidence for this claim, or know you cannot get more.",
      inputSchema: z.object({ note: z.string().describe("One sentence: what you gathered and anything missing") }),
      execute: async ({ note }) => ({ ok: true, note }),
    });
    return tools;
  };

  const prompt = [
    `Dispute ${d.id}: ${CLAIM_LABEL[d.claimType]} (PayPal reason ${d.reason}).`,
    `Item: ${d.itemName || "unknown"}. Amount: ${d.amount} ${d.currency}.`,
    d.buyerClaim ? `Buyer's claim: "${d.buyerClaim}"` : "",
    summary ? `Summary: ${summary.summary} The evidence must settle: ${summary.keyQuestion}` : "",
    "Gather the evidence now.",
  ]
    .filter(Boolean)
    .join("\n");

  let note = "";
  let modelId = "rules fallback";
  try {
    const res = await withModelFallback("evidence gathering", async (model) => {
      return generateText({
        model,
        instructions: INSTRUCTIONS,
        prompt,
        tools: buildTools(),
        stopWhen: [isStepCount(8), hasToolCall("finish_gathering")],
        ...CALL_SETTINGS,
      });
    });
    modelId = res.modelId;
    const finish = res.value.toolCalls.find((c) => c.toolName === "finish_gathering");
    note = (finish?.input as { note?: string } | undefined)?.note ?? `Stopped after ${res.value.steps.length} steps.`;
  } catch (err) {
    const why = (err as Error).message.replace(/\s*\n\s*/g, " ").slice(0, 400);
    addEvent(d.id, "agent:fallback", `AI unavailable during gathering: ${why}`);
    if (steps.length) {
      modelId = "partial AI, then rules";
      note = "The AI fetched part of the evidence before the models became unavailable; the rest was fetched by fixed rules.";
    } else {
      note = "Gathered by fixed rules because the AI models were unavailable.";
    }
  }

  // Safety net: make sure the records this claim type needs were fetched, whatever the model decided.
  const fetched = new Set(steps.flatMap((s) => TOOL_KINDS[s.tool]?.kinds ?? []));
  const skipped = REQUIRED_KINDS[d.claimType].filter((k) => !fetched.has(k));
  if (skipped.length) {
    const r = await collectEvidence(d.id, skipped);
    const label = steps.length === 0 ? "rules" : "safety_net";
    steps.push({ step: steps.length + 1, tool: label, input: { kinds: skipped }, saved: r.records.map((x) => x.id), missing: r.missing });
    addEvent(d.id, `agent:${label}`, `Also fetched ${skipped.join(", ")}`);
  }

  return { steps, note, modelId };
}
