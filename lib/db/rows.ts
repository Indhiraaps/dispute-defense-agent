import type Database from "better-sqlite3";
import type { DisputeRow, EvidenceRecord, TimelineEvent } from "../types";

/**
 * Row mapping and writes that take the database as a parameter.
 * Kept free of getDb() so the seeder can use them without an import cycle.
 */

type DisputeDbRow = {
  id: string;
  source: string;
  claim_type: string;
  reason: string;
  buyer_claim: string;
  paypal_status: string;
  stage: string;
  amount: string;
  currency: string;
  item_name: string;
  buyer_name: string;
  buyer_country: string;
  transaction_id: string;
  order_id: string;
  opened_at: string;
  seller_due_at: string | null;
  state: string;
  outcome: string | null;
  updated_at: string;
};

export function toDispute(r: DisputeDbRow): DisputeRow {
  return {
    id: r.id,
    source: r.source as DisputeRow["source"],
    claimType: r.claim_type as DisputeRow["claimType"],
    reason: r.reason,
    buyerClaim: r.buyer_claim,
    paypalStatus: r.paypal_status,
    stage: r.stage,
    amount: r.amount,
    currency: r.currency,
    itemName: r.item_name,
    buyerName: r.buyer_name,
    buyerCountry: r.buyer_country,
    transactionId: r.transaction_id,
    orderId: r.order_id,
    openedAt: r.opened_at,
    sellerDueAt: r.seller_due_at,
    state: r.state as DisputeRow["state"],
    outcome: r.outcome,
    updatedAt: r.updated_at,
  };
}

type EvidenceDbRow = {
  dispute_id: string;
  id: string;
  kind: string;
  source_ref: string;
  source: string;
  title: string;
  text: string;
  facts: string;
  collected_at: string;
};

export function toEvidence(r: EvidenceDbRow): EvidenceRecord {
  return {
    id: r.id,
    disputeId: r.dispute_id,
    kind: r.kind as EvidenceRecord["kind"],
    sourceRef: r.source_ref,
    source: r.source,
    title: r.title,
    text: r.text,
    facts: JSON.parse(r.facts),
    collectedAt: r.collected_at,
  };
}

export function toEvent(r: { id: number; dispute_id: string; at: string; type: string; detail: string }): TimelineEvent {
  return { id: r.id, disputeId: r.dispute_id, at: r.at, type: r.type, detail: r.detail };
}

/**
 * Insert or update a dispute. On update the workflow state is kept, unless
 * PayPal reports the dispute resolved.
 */
export function upsertDisputeRow(db: Database.Database, d: Omit<DisputeRow, "updatedAt">, raw?: unknown) {
  db.prepare(
    `INSERT INTO disputes (id, source, claim_type, reason, buyer_claim, paypal_status, stage, amount, currency,
       item_name, buyer_name, buyer_country, transaction_id, order_id, opened_at, seller_due_at, state, outcome, raw, updated_at)
     VALUES (@id, @source, @claimType, @reason, @buyerClaim, @paypalStatus, @stage, @amount, @currency,
       @itemName, @buyerName, @buyerCountry, @transactionId, @orderId, @openedAt, @sellerDueAt, @state, @outcome, @raw, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       claim_type = excluded.claim_type,
       reason = excluded.reason,
       buyer_claim = CASE WHEN excluded.buyer_claim <> '' THEN excluded.buyer_claim ELSE disputes.buyer_claim END,
       paypal_status = excluded.paypal_status,
       stage = excluded.stage,
       amount = excluded.amount,
       currency = excluded.currency,
       item_name = CASE WHEN excluded.item_name <> '' THEN excluded.item_name ELSE disputes.item_name END,
       buyer_name = CASE WHEN excluded.buyer_name <> '' THEN excluded.buyer_name ELSE disputes.buyer_name END,
       transaction_id = CASE WHEN excluded.transaction_id <> '' THEN excluded.transaction_id ELSE disputes.transaction_id END,
       seller_due_at = COALESCE(excluded.seller_due_at, disputes.seller_due_at),
       state = CASE WHEN excluded.state = 'RESOLVED' THEN 'RESOLVED' ELSE disputes.state END,
       outcome = COALESCE(excluded.outcome, disputes.outcome),
       raw = COALESCE(excluded.raw, disputes.raw),
       updated_at = excluded.updated_at`,
  ).run({ ...d, raw: raw === undefined ? null : JSON.stringify(raw), updatedAt: new Date().toISOString() });
}

export function insertEvent(db: Database.Database, disputeId: string, type: string, detail = "", at?: string) {
  db.prepare("INSERT INTO events (dispute_id, at, type, detail) VALUES (?, ?, ?, ?)").run(
    disputeId,
    at ?? new Date().toISOString(),
    type,
    detail,
  );
}
