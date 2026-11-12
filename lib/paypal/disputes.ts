import { paypalRequest } from "./client";

export type Money = { currency_code: string; value: string };
export type Link = { href: string; rel: string; method?: string };

/** The fields of a PayPal dispute this app uses. PayPal returns more. */
export type Dispute = {
  dispute_id: string;
  reason: string;
  status: string;
  dispute_state?: string;
  dispute_life_cycle_stage?: string;
  dispute_channel?: string;
  dispute_amount?: Money;
  create_time?: string;
  update_time?: string;
  seller_response_due_date?: string;
  buyer_response_due_date?: string;
  disputed_transactions?: {
    seller_transaction_id?: string;
    buyer_transaction_id?: string;
    create_time?: string;
    transaction_status?: string;
    gross_amount?: Money;
    invoice_number?: string;
    custom?: string;
    buyer?: { name?: string };
    seller?: { email?: string; merchant_id?: string; name?: string };
    items?: { item_id?: string; item_name?: string; item_description?: string; item_quantity?: string }[];
  }[];
  messages?: { posted_by: string; time_posted?: string; content?: string }[];
  dispute_outcome?: { outcome_code?: string; amount_refunded?: Money };
  offer?: unknown;
  evidences?: unknown[];
  links?: Link[];
};

export type DisputeSummary = Pick<
  Dispute,
  "dispute_id" | "reason" | "status" | "dispute_state" | "dispute_amount" | "create_time" | "update_time" | "links"
> & { dispute_life_cycle_stage?: string };

const base = (id: string) => `/v1/customer/disputes/${encodeURIComponent(id)}`;

export async function listDisputes(query: {
  disputed_transaction_id?: string;
  dispute_state?: string;
  page_size?: number;
  next_page_token?: string;
} = {}) {
  const res = await paypalRequest<{ items?: DisputeSummary[]; links?: Link[] }>("GET", "/v1/customer/disputes", {
    query,
  });
  return res.data.items ?? [];
}

export async function getDispute(id: string) {
  return (await paypalRequest<Dispute>("GET", base(id))).data;
}

/**
 * The actions PayPal currently allows on this dispute, read from its HATEOAS links
 * (for example "provide_evidence", "make_offer", "accept_claim").
 */
export function allowedActions(dispute: Pick<Dispute, "links">): string[] {
  return (dispute.links ?? []).map((l) => l.rel).filter((rel) => rel !== "self");
}

// ---------- seller responses ----------

export type Evidence = {
  evidence_type: string; // e.g. PROOF_OF_FULFILLMENT, PROOF_OF_REFUND, OTHER
  evidence_info?: {
    tracking_info?: { carrier_name: string; carrier_name_other?: string; tracking_number: string; tracking_url?: string }[];
    refund_ids?: { refund_id: string }[];
  };
  notes?: string;
  documents?: { name: string }[];
};

export type EvidenceFile = { name: string; data: Uint8Array; contentType: string };

/**
 * POST /provide-evidence as multipart/form-data: a JSON part named "input",
 * plus one part per file named "evidence_file" (confirmed in the sandbox, Phase 7).
 */
export async function provideEvidence(
  id: string,
  input: { evidences: Evidence[] },
  files: EvidenceFile[] = [],
  filePartName = "evidence_file",
  requestId?: string,
) {
  const form = new FormData();
  form.append("input", new Blob([JSON.stringify(input)], { type: "application/json" }));
  for (const f of files) {
    form.append(filePartName, new Blob([Buffer.from(f.data)], { type: f.contentType }), f.name);
  }
  return paypalRequest<{ links?: Link[] }>("POST", `${base(id)}/provide-evidence`, { form, requestId });
}

export type OfferType = "REFUND" | "REFUND_WITH_RETURN" | "REFUND_WITH_REPLACEMENT" | "REPLACEMENT_WITHOUT_REFUND";

export async function makeOffer(id: string, args: { note: string; amount: Money; offerType?: OfferType; requestId?: string }) {
  return paypalRequest<{ links?: Link[] }>("POST", `${base(id)}/make-offer`, {
    json: { note: args.note, offer_amount: args.amount, offer_type: args.offerType ?? "REFUND" },
    requestId: args.requestId,
  });
}

export async function acceptClaim(id: string, args: { note: string; acceptClaimType?: string; requestId?: string }) {
  return paypalRequest<{ links?: Link[] }>("POST", `${base(id)}/accept-claim`, {
    json: { note: args.note, ...(args.acceptClaimType ? { accept_claim_type: args.acceptClaimType } : {}) },
    requestId: args.requestId,
  });
}

export async function sendMessage(id: string, message: string) {
  return paypalRequest<{ links?: Link[] }>("POST", `${base(id)}/send-message`, { json: { message } });
}

export async function escalate(id: string, note: string) {
  return paypalRequest<{ links?: Link[] }>("POST", `${base(id)}/escalate`, { json: { note } });
}

// ---------- sandbox-only helpers (used for demos) ----------

/** Sandbox only: move the dispute to "waiting for buyer/seller evidence". */
export async function requireEvidence(id: string, action: "BUYER_EVIDENCE" | "SELLER_EVIDENCE") {
  return paypalRequest<{ links?: Link[] }>("POST", `${base(id)}/require-evidence`, { json: { action } });
}

/** Sandbox only: simulate PayPal's final decision. */
export async function adjudicate(id: string, outcome: "BUYER_FAVOR" | "SELLER_FAVOR") {
  return paypalRequest<{ links?: Link[] }>("POST", `${base(id)}/adjudicate`, {
    json: { adjudication_outcome: outcome },
  });
}
