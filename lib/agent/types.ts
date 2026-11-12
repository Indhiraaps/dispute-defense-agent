/** What the AI agent produces for one dispute. Stored in the `analysis` table. */

export type ComplaintSummary = {
  summary: string; // plain-English, one sentence
  buyerWants: "full_refund" | "partial_refund" | "replacement" | "item_delivery" | "information" | "unclear";
  keyQuestion: string; // what the evidence has to settle
};

export const MESSAGE_SIGNALS = [
  "BUYER_CONFIRMS_RECEIPT",
  "BUYER_ACCEPTS_ITEM",
  "BUYER_REPORTS_PROBLEM",
  "BUYER_REQUESTS_REFUND",
  "SELLER_ADMITS_FAULT",
  "SELLER_OFFERS_HELP",
] as const;
export type MessageSignal = (typeof MESSAGE_SIGNALS)[number];

/** A statement found in one message. Its quote must appear word for word in that message. */
export type MessageFinding = {
  evidenceId: string; // e.g. MSG-001
  signal: MessageSignal;
  quote: string;
  explanation: string;
};

export type PhotoFinding = {
  attribute: string; // e.g. "colour"
  listingShows: string;
  buyerPhotoShows: string;
  verdict: "consistent" | "inconsistent" | "unclear";
  factors: string; // lighting, camera, angle
  confidence: number; // 0..1
  citedIds: string[]; // IMG-xxx records it looked at
};

export type AgentStep = {
  step: number;
  tool: string;
  input: Record<string, unknown>;
  saved: string[]; // evidence IDs saved by this call
  missing: string[];
};

export type Analysis = {
  disputeId: string;
  summary: ComplaintSummary | null;
  steps: AgentStep[];
  gatheringNote: string; // the agent's reason for stopping
  messageFindings: MessageFinding[];
  rejectedFindings: number; // findings dropped because the quote or ID didn't check out
  photoFinding: PhotoFinding | null;
  models: Record<string, string>; // task -> model that answered, or "rules fallback"
  updatedAt: string;
};
