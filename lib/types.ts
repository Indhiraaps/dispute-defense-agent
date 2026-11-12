/** Shared types for the local dispute store. */

export type ClaimType = "INR" | "SNAD" | "UNAUTHORIZED" | "OTHER";

/** Where the agent is in handling a dispute. */
export type WorkflowState =
  | "NEW" // just arrived
  | "GATHERING" // collecting evidence
  | "SCORED" // rules have scored the case
  | "DRAFTED" // response drafted and checked
  | "AWAITING_APPROVAL" // waiting for the seller's click
  | "APPROVED" // seller approved; ready to send to PayPal
  | "SUBMITTED" // sent to PayPal
  | "RESOLVED" // PayPal decided
  | "MANUAL"; // seller chose to handle it themselves

export type DisputeSource = "demo" | "paypal";

export type DisputeRow = {
  id: string; // PayPal dispute ID, or DEMO-xxxx
  source: DisputeSource;
  claimType: ClaimType;
  reason: string; // PayPal reason code
  buyerClaim: string; // the buyer's own words, if known
  paypalStatus: string;
  stage: string;
  amount: string; // "120.00"
  currency: string;
  itemName: string;
  buyerName: string; // already shortened, e.g. "Lena M."
  buyerCountry: string;
  transactionId: string;
  orderId: string;
  openedAt: string; // ISO
  sellerDueAt: string | null; // ISO
  state: WorkflowState;
  outcome: string | null;
  updatedAt: string;
};

export type EvidenceKind = "payment" | "order" | "tracking" | "delivery" | "listing" | "message" | "policy" | "photo";

export const EVIDENCE_PREFIX: Record<EvidenceKind, string> = {
  payment: "PAY",
  order: "ORD",
  tracking: "TRK",
  delivery: "DLV",
  listing: "LST",
  message: "MSG",
  policy: "POL",
  photo: "IMG",
};

/** Exact values the citation checker compares against the draft (dates, numbers, IDs). */
export type Facts = Record<string, string | number | boolean | null>;

export type EvidenceRecord = {
  id: string; // e.g. TRK-001, unique within its dispute
  disputeId: string;
  kind: EvidenceKind;
  sourceRef: string; // stable key from the source, keeps the ID the same on re-collection
  source: string; // where it came from, shown to the seller
  title: string;
  text: string; // one or two plain sentences a draft may cite
  facts: Facts;
  collectedAt: string;
};

export type TimelineEvent = {
  id: number;
  disputeId: string;
  at: string;
  type: string;
  detail: string;
};
