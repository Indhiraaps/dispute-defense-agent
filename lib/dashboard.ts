import { CLAIM_LABEL, countryName } from "./claims";
import { getCaseFile, listDisputes } from "./db/repo";
import { playbook } from "./submit/outcomes";
import type { WorkflowState } from "./types";

/** One row of the seller's dispute inbox. Plain data, so it can go to the browser as JSON. */
export type InboxRow = {
  id: string;
  source: "demo" | "paypal";
  item: string;
  claim: string;
  amount: number;
  currency: string;
  buyer: string;
  dueAt: string | null;
  state: WorkflowState;
  band: "CONTEST" | "OFFER" | "ACCEPT" | null;
  score: number | null;
  offerAmount: string | null;
  draftOk: boolean | null;
  evidence: number;
  updatedAt: string;
};

export type InboxKpis = {
  open: number;
  needsApproval: number;
  dueSoon: number; // due within 72 hours
  amountAtStake: number; // USD, open disputes
  contest: number;
  offer: number;
  accept: number;
  won: number;
  lost: number;
  conceded: number;
  settled: number;
};

const CLOSED: WorkflowState[] = ["RESOLVED", "MANUAL"];

export function inboxData(now = Date.now()): { rows: InboxRow[]; kpis: InboxKpis; generatedAt: string } {
  const rows: InboxRow[] = listDisputes().map((d) => {
    const file = getCaseFile(d.id);
    return {
      id: d.id,
      source: d.source,
      item: d.itemName || "-",
      claim: CLAIM_LABEL[d.claimType],
      amount: Number(d.amount),
      currency: d.currency,
      buyer: [d.buyerName, d.buyerCountry ? countryName(d.buyerCountry) : ""].filter(Boolean).join(", ") || "-",
      dueAt: d.sellerDueAt,
      state: d.state,
      band: file?.score.band ?? null,
      score: file?.score.score ?? null,
      offerAmount: file?.score.offer?.amount ?? null,
      draftOk: file ? file.draft.check.ok : null,
      evidence: d.evidenceCount,
      updatedAt: d.updatedAt,
    };
  });

  const open = rows.filter((r) => !CLOSED.includes(r.state));
  const kpis: InboxKpis = {
    open: open.length,
    needsApproval: open.filter((r) => r.state === "AWAITING_APPROVAL").length,
    dueSoon: open.filter((r) => r.dueAt && new Date(r.dueAt).getTime() - now < 72 * 3_600_000).length,
    amountAtStake: open.filter((r) => r.currency === "USD").reduce((s, r) => s + r.amount, 0),
    contest: open.filter((r) => r.band === "CONTEST").length,
    offer: open.filter((r) => r.band === "OFFER").length,
    accept: open.filter((r) => r.band === "ACCEPT").length,
    ...(({ won, lost, conceded, settled }) => ({ won, lost, conceded, settled }))(playbook().totals),
  };
  return { rows, kpis, generatedAt: new Date(now).toISOString() };
}
