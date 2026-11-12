import { CLAIM_LABEL } from "@/lib/claims";
import type { ClaimType, WorkflowState } from "@/lib/types";

/** Small shared display helpers. Phase 6 replaces the list with AG Grid. */

export function timeLeft(dueIso: string | null, now = Date.now()): { label: string; urgent: boolean } {
  if (!dueIso) return { label: "No deadline", urgent: false };
  const ms = new Date(dueIso).getTime() - now;
  if (ms <= 0) return { label: "Overdue", urgent: true };
  const h = Math.floor(ms / 3_600_000);
  const d = Math.floor(h / 24);
  return { label: d > 0 ? `${d}d ${h % 24}h left` : `${h}h left`, urgent: h < 72 };
}

const STATE_LABEL: Record<WorkflowState, string> = {
  NEW: "New",
  GATHERING: "Gathering evidence",
  SCORED: "Scored",
  DRAFTED: "Drafted",
  AWAITING_APPROVAL: "Needs your approval",
  APPROVED: "Approved",
  SUBMITTED: "Submitted",
  RESOLVED: "Resolved",
  MANUAL: "Handled manually",
};

export function StatePill({ state }: { state: WorkflowState }) {
  return <span className={`pill pill-${state.toLowerCase()}`}>{STATE_LABEL[state] ?? state}</span>;
}

export function ClaimTag({ type }: { type: ClaimType }) {
  return <span className="claim">{CLAIM_LABEL[type]}</span>;
}

export function money(amount: string, currency: string) {
  return currency === "USD" ? `$${amount}` : `${amount} ${currency}`;
}
