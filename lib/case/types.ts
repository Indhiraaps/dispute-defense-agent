/** Phase 4: the score, the draft response and its citation check. */

export type Band = "CONTEST" | "OFFER" | "ACCEPT";

export type ScoreRule = {
  id: string;
  label: string; // plain words shown to the seller
  points: number; // added when met (negative for rules that hurt the case)
  met: boolean;
  cites: string[]; // evidence IDs behind this rule
};

export type ScoreResult = {
  score: number; // 0..100
  band: Band;
  rules: ScoreRule[];
  offer: { percent: number; amount: string; currency: string } | null; // only for OFFER
  advice: string[]; // tips for the seller, not sent to PayPal
};

export type CheckProblem = { sentence: number; text: string; issue: string };

export type CheckResult = {
  ok: boolean;
  sentences: number;
  problems: CheckProblem[];
};

export type Draft = {
  band: Band;
  audience: "paypal" | "buyer";
  text: string; // sentences with inline citations like [TRK-001]
  evidenceType: string | null; // PayPal evidence type for a contest
  check: CheckResult;
  attempts: number; // drafts written before one passed (max 3)
  removed: string[]; // sentences dropped because they never passed the check
  model: string; // or "template (AI unavailable)"
  editedBySeller?: boolean;
};

export type Approval = {
  at: string;
  action: string; // what will be sent, in plain words
};

export type CaseFile = {
  disputeId: string;
  score: ScoreResult;
  draft: Draft;
  approval?: Approval | null;
  updatedAt: string;
};
