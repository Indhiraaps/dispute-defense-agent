/** Phase 7: what was sent to PayPal, and how each dispute ended. */

export type SubmitAction = "provide_evidence" | "make_offer" | "accept_claim";

export type Submission = {
  disputeId: string;
  at: string;
  mode: "paypal" | "demo"; // demo disputes are never sent; the request is recorded as a preview
  action: SubmitAction;
  ok: boolean;
  requestId: string; // PayPal-Request-Id: the same approval always reuses it, so a retry can't double-submit
  request: Record<string, unknown>; // what was sent (no file bytes)
  response?: unknown;
  debugId?: string;
  error?: string;
  paypalStatusAfter?: string;
};

export type OutcomeKind = "won" | "lost" | "conceded" | "settled" | "other";

export type Outcome = {
  disputeId: string;
  at: string;
  code: string; // PayPal outcome code, or DEMO_SELLER_FAVOUR / DEMO_BUYER_FAVOUR
  kind: OutcomeKind;
  claimType: string;
  band: string | null; // what the agent recommended
  action: string | null; // what the seller sent
  evidenceKinds: string[]; // kinds of records cited in what was sent
  demo: boolean;
};
