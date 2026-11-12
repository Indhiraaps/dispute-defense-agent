import { citesIn, splitSentences } from "../case/check";
import { addEvent, getCaseFile, getDispute, getOutcome, listEvidence, listOutcomes, listSubmissions, saveDispute, saveOutcome, setState } from "../db/repo";
import type { Outcome, OutcomeKind } from "./types";

/**
 * Step 10: record how each dispute ended, against the evidence that was used,
 * so the seller can see which evidence wins (the playbook).
 */

export function outcomeKind(code: string): OutcomeKind {
  if (/SELLER_FAVOU?R|CANCELED_BY_BUYER|DENIED/.test(code)) return "won";
  if (/BUYER_FAVOU?R|RESOLVED_WITH_PAYOUT/.test(code)) return "lost";
  if (/ACCEPTED/.test(code)) return "conceded";
  if (/OFFER|PARTIAL|SETTLED/.test(code)) return "settled";
  return "other";
}

export const OUTCOME_LABEL: Record<OutcomeKind, string> = {
  won: "Won (seller's favour)",
  lost: "Lost (buyer's favour)",
  conceded: "Accepted by the seller",
  settled: "Settled",
  other: "Closed",
};

/** Saves the outcome of a resolved dispute, once. Called after every import from PayPal. */
export function recordOutcome(disputeId: string, code: string, demo = false): Outcome | null {
  if (getOutcome(disputeId)) return null;
  const d = getDispute(disputeId);
  if (!d) return null;
  const file = getCaseFile(disputeId);
  const sent = listSubmissions(disputeId).filter((s) => s.ok).at(-1);
  const evidence = listEvidence(disputeId);
  const cited = file ? new Set(splitSentences(file.draft.text).flatMap(citesIn)) : new Set<string>();
  const outcome: Outcome = {
    disputeId,
    at: new Date().toISOString(),
    code,
    kind: sent?.action === "accept_claim" && !/SELLER/.test(code) ? "conceded" : outcomeKind(code),
    claimType: d.claimType,
    band: file?.score.band ?? null,
    action: sent?.action ?? null,
    evidenceKinds: [...new Set(evidence.filter((e) => cited.has(e.id)).map((e) => e.kind))],
    demo,
  };
  saveOutcome(outcome);
  addEvent(disputeId, "outcome", `${OUTCOME_LABEL[outcome.kind]} (${code})`);
  return outcome;
}

/** Demo disputes have no PayPal decision, so the sandbox controls can simulate one. Clearly marked as demo. */
export function simulateDemoDecision(disputeId: string, favour: "SELLER" | "BUYER"): Outcome | null {
  const d = getDispute(disputeId);
  if (!d || d.source !== "demo") throw new Error("Only demo disputes can be decided locally. Use the sandbox controls for PayPal disputes.");
  if (d.state !== "SUBMITTED") throw new Error("Send the response first.");
  const code = `DEMO_${favour}_FAVOUR`;
  saveDispute({ ...d, paypalStatus: "RESOLVED", outcome: code, state: "RESOLVED" });
  setState(disputeId, "RESOLVED", `Demo decision: ${favour === "SELLER" ? "seller" : "buyer"} wins (simulated, not PayPal)`);
  return recordOutcome(disputeId, code, true);
}

export type Playbook = {
  totals: Record<OutcomeKind, number>;
  byEvidence: { kind: string; won: number; total: number }[];
  byClaim: { claimType: string; won: number; total: number }[];
};

/** Win rates by evidence kind and claim type, from recorded outcomes. Reports only what was measured. */
export function playbook(): Playbook {
  const all = listOutcomes();
  const totals: Record<OutcomeKind, number> = { won: 0, lost: 0, conceded: 0, settled: 0, other: 0 };
  for (const o of all) totals[o.kind]++;
  const contested = all.filter((o) => o.action === "provide_evidence");
  const tally = <K extends string>(key: (o: Outcome) => K[]) => {
    const m = new Map<K, { won: number; total: number }>();
    for (const o of contested)
      for (const k of key(o)) {
        const t = m.get(k) ?? { won: 0, total: 0 };
        t.total++;
        if (o.kind === "won") t.won++;
        m.set(k, t);
      }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  };
  return {
    totals,
    byEvidence: tally((o) => o.evidenceKinds).map(([kind, t]) => ({ kind, ...t })),
    byClaim: tally((o) => [o.claimType]).map(([claimType, t]) => ({ claimType, ...t })),
  };
}
