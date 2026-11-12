import { claimTypeForReason, shortName } from "../claims";
import { addEvent, getDispute as getLocal, listDisputes as listLocal, saveDispute } from "../db/repo";
import { collectEvidence } from "../evidence/collect";
import { recordOutcome } from "../submit/outcomes";
import type { DisputeRow } from "../types";
import { getDispute, listDisputes, type Dispute } from "./disputes";

/** Maps a PayPal dispute to the local record. */
export function disputeToRow(d: Dispute): Omit<DisputeRow, "updatedAt"> {
  const tx = d.disputed_transactions?.[0];
  const firstBuyerMsg = d.messages?.find((m) => m.posted_by === "BUYER")?.content ?? "";
  const resolved = d.status === "RESOLVED";
  return {
    id: d.dispute_id,
    source: "paypal",
    claimType: claimTypeForReason(d.reason),
    reason: d.reason,
    buyerClaim: firstBuyerMsg,
    paypalStatus: d.status,
    stage: d.dispute_life_cycle_stage ?? "",
    amount: d.dispute_amount?.value ?? tx?.gross_amount?.value ?? "0.00",
    currency: d.dispute_amount?.currency_code ?? tx?.gross_amount?.currency_code ?? "USD",
    itemName: tx?.items?.[0]?.item_name ?? tx?.items?.[0]?.item_description ?? "",
    buyerName: shortName(tx?.buyer?.name),
    buyerCountry: "",
    transactionId: tx?.seller_transaction_id ?? "",
    orderId: tx?.invoice_number || tx?.custom || "",
    openedAt: d.create_time ?? new Date().toISOString(),
    sellerDueAt: d.seller_response_due_date ?? null,
    state: resolved ? "RESOLVED" : "NEW",
    outcome: d.dispute_outcome?.outcome_code ?? null,
  };
}

/**
 * Fetches one dispute from PayPal and saves it. New disputes get their
 * evidence collected straight away. Returns whether it was new.
 */
export async function importDispute(id: string, why = "sync"): Promise<{ id: string; isNew: boolean; status: string }> {
  const full = await getDispute(id);
  const before = getLocal(id);
  const isNew = !before;
  saveDispute(disputeToRow(full), full);
  // Log only real changes, so regular syncs don't flood the timeline.
  if (isNew) addEvent(id, "dispute:opened", `${why}: PayPal status ${full.status}`);
  else if (before.paypalStatus !== full.status)
    addEvent(id, "paypal:status", `${before.paypalStatus || "unknown"} → ${full.status} (${why})`);
  if (isNew) await collectEvidence(id);
  if (full.status === "RESOLVED") recordOutcome(id, full.dispute_outcome?.outcome_code ?? "RESOLVED");
  return { id, isNew, status: full.status };
}

/**
 * Pulls every dispute on the sandbox seller account, plus every PayPal dispute
 * already saved locally and any listed in PAYPAL_DISPUTE_IDS. PayPal's list can
 * lag behind new disputes (seen in Phase 0), so known IDs are always refreshed too.
 */
export async function syncAllDisputes() {
  const ids = new Set((await listDisputes({ page_size: 50 })).map((d) => d.dispute_id));
  for (const d of listLocal()) if (d.source === "paypal") ids.add(d.id);
  for (const id of (process.env.PAYPAL_DISPUTE_IDS ?? "").split(",")) if (id.trim()) ids.add(id.trim());
  const results = [];
  for (const id of ids) results.push(await importDispute(id, "sync"));
  return results;
}
