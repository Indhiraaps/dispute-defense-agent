import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PDFPage } from "pdf-lib";
import { lookupTracking } from "../carrier/mock";
import { citesIn, splitSentences } from "../case/check";
import { CLAIM_LABEL, countryName, formatDate } from "../claims";
import { getCaseFile, getDispute, listEvidence } from "../db/repo";
import { DEMO_SELLER } from "../seed/demo-store";
import type { EvidenceRecord } from "../types";
import { INK, Layout, LINE, MUTED, PAGE } from "./layout";

/**
 * Step 7 of the flow: the evidence packet PDF sent to PayPal with a contest.
 *   Page 1: dispute details, the seller's cited statement, an index of records
 *   Then:   one section per record (tracking timeline, delivery facts, photos,
 *           messages, listing), so every [ID] in the statement can be checked.
 * Internal material (scores, AI notes, model names) is never included.
 */

/** PayPal accepts evidence files up to 10 MB each. */
export const PAYPAL_FILE_LIMIT = 10 * 1024 * 1024;

export type Packet = {
  bytes: Uint8Array;
  filename: string;
  pages: number;
  includedIds: string[];
};

const KIND_ORDER = ["payment", "order", "tracking", "delivery", "listing", "photo", "message", "policy"];

/** The records the statement or the score relies on, plus the payment and order for context. */
export function selectRecords(evidence: EvidenceRecord[], statement: string, ruleCites: string[]): EvidenceRecord[] {
  const wanted = new Set<string>([...splitSentences(statement).flatMap(citesIn), ...ruleCites]);
  for (const e of evidence) if (e.kind === "payment" || e.kind === "order") wanted.add(e.id);
  return evidence
    .filter((e) => wanted.has(e.id))
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.id.localeCompare(b.id));
}

/** Approximate height of each kind of record section, in points, so short records are never split. */
const KEEP_TOGETHER: Record<string, number> = {
  payment: 150,
  order: 170,
  tracking: 260,
  delivery: 170,
  listing: 190,
  photo: 400,
  message: 110,
  policy: 110,
};

const yesNo = (v: unknown) => (v === true ? "Yes" : v === false ? "No" : String(v ?? "-"));
const dateOr = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? formatDate(v) : "-");

async function drawRecord(L: Layout, e: EvidenceRecord) {
  L.recordHeader(e.id, e.title);
  L.text(`Source: ${e.source}`, { size: 8.5, color: MUTED });
  L.gap(2);
  const f = e.facts;

  switch (e.kind) {
    case "payment":
      L.table([
        ["PayPal transaction", String(f.transaction_id ?? "-")],
        ["Amount", `${f.amount ?? "-"} ${f.currency ?? ""}`],
        ["Date", dateOr(f.paid_at)],
        ["Status", String(f.status ?? "-")],
      ]);
      break;
    case "order":
      L.table([
        ["Order", String(f.order_id ?? "-")],
        ["Items", String(f.items ?? "-")],
        [
          "Ship to",
          f.ship_to_city ? `${f.ship_to_city} ${f.ship_to_postal_code ?? ""}, ${countryName(String(f.ship_to_country ?? ""))}` : "-",
        ],
        ["Paid", dateOr(f.paid_at)],
        ["Marked shipped", dateOr(f.shipped_at)],
      ]);
      break;
    case "tracking": {
      L.text(e.text);
      const t = typeof f.tracking_number === "string" ? await lookupTracking(f.tracking_number) : null;
      if (t) {
        L.gap(4);
        L.text("Carrier scan history", { size: 9.5, font: L.bold });
        L.table(t.events.map((ev) => [formatDate(ev.at), `${ev.status}, ${ev.location}`] as [string, string]), { keyWidth: 90 });
      }
      L.table([["Address matches order", yesNo(f.address_match)]]);
      break;
    }
    case "delivery":
      L.text(e.text);
      L.gap(2);
      L.table([
        ["Delivered", yesNo(f.delivered)],
        ["Delivery date", dateOr(f.delivered_at)],
        ["Delivered to postcode", String(f.delivered_postal_code ?? "-")],
        ["Signed by", String(f.signed_by ?? "No signature recorded")],
      ]);
      break;
    case "listing": {
      L.text(e.text);
      const attrs = Object.entries(f).filter(([k]) => !["sku", "title", "snapshot_at"].includes(k));
      if (attrs.length) {
        L.gap(2);
        L.table(attrs.map(([k, v]) => [k.charAt(0).toUpperCase() + k.slice(1), String(v)] as [string, string]));
      }
      break;
    }
    case "photo": {
      const rel = String(f.path ?? "");
      try {
        const bytes = await readFile(path.join(process.cwd(), "public", rel));
        await L.image(bytes, /\.jpe?g$/i.test(rel) ? "jpg" : "png", 300, 300);
      } catch {
        L.text("(Image file not found.)", { color: MUTED });
      }
      L.text(e.text, { size: 9.5 });
      break;
    }
    case "message": {
      const who = f.from === "seller" ? "Seller" : "Buyer";
      L.text(`${who}, ${dateOr(f.date)}`, { size: 9.5, font: L.bold });
      const startY = L.y;
      const startPage = L.page;
      L.text(`"${String(f.text ?? e.text)}"`, { x: PAGE.margin + 14, size: 11 });
      if (L.page === startPage) {
        L.page.drawLine({ start: { x: PAGE.margin + 4, y: startY - 2 }, end: { x: PAGE.margin + 4, y: L.y + 2 }, thickness: 2, color: LINE });
      }
      break;
    }
    default:
      L.text(e.text);
  }
  L.gap(6);
}

export async function buildEvidencePacket(disputeId: string): Promise<Packet> {
  const d = getDispute(disputeId);
  if (!d) throw new Error(`Unknown dispute ${disputeId}`);
  const file = getCaseFile(d.id);
  if (!file) throw new Error(`Dispute ${d.id} has no draft yet. Run the agent first.`);
  const evidence = listEvidence(d.id);
  const ruleCites = file.score.rules.filter((r) => r.met && r.points > 0).flatMap((r) => r.cites);
  const records = selectRecords(evidence, file.draft.text, ruleCites);
  const prepared = formatDate(new Date().toISOString());

  const L = await Layout.create(`Seller evidence for PayPal dispute ${d.id}`);

  // ---- Cover ----
  L.text("SELLER EVIDENCE  ·  PAYPAL DISPUTE", { size: 9, font: L.bold, color: MUTED });
  L.gap(2);
  L.text(d.id, { size: 24, font: L.bold });
  L.gap(8);
  L.table([
    ["Claim", `${CLAIM_LABEL[d.claimType]} (${d.reason})`],
    ["Disputed amount", `${d.amount} ${d.currency}`],
    ["PayPal transaction", d.transactionId || "-"],
    ["Order", d.orderId || "-"],
    ["Item", d.itemName || "-"],
    ["Buyer", [d.buyerName, d.buyerCountry ? countryName(d.buyerCountry) : ""].filter(Boolean).join(", ") || "-"],
    ["Seller", `${DEMO_SELLER.name}, ${DEMO_SELLER.city}, ${countryName(DEMO_SELLER.country)}`],
    ["Prepared", prepared],
  ]);

  L.heading(file.draft.audience === "buyer" ? "Seller's message to the buyer" : "Seller's statement");
  for (const s of splitSentences(file.draft.text)) {
    L.text(s, { size: 11, lineGap: 1.45 });
    L.gap(3);
  }
  L.gap(2);
  L.text("Each bracketed ID, for example [TRK-001], refers to the record with that ID in this packet.", { size: 8.5, color: MUTED });

  L.heading("Evidence index", 13);
  const slots: { page: PDFPage; y: number; id: string }[] = [];
  for (const e of records) {
    L.ensure(16);
    L.y -= 15;
    L.page.drawText(e.id, { x: PAGE.margin, y: L.y + 3, size: 10, font: L.bold, color: INK });
    const [title] = L.wrap(e.title, 10, L.contentWidth - 130);
    L.page.drawText(title ?? "", { x: PAGE.margin + 70, y: L.y + 3, size: 10, font: L.regular, color: INK });
    slots.push({ page: L.page, y: L.y + 3, id: e.id });
  }

  // ---- One section per record ----
  const pageOf = new Map<string, number>();
  L.newPage();
  for (const e of records) {
    L.ensure(KEEP_TOGETHER[e.kind] ?? 110); // start a new page rather than split a short record
    pageOf.set(e.id, L.pageNumber);
    await drawRecord(L, e);
  }

  // Fill in the index page numbers now that the records are placed.
  for (const s of slots) {
    const label = `p. ${pageOf.get(s.id) ?? "-"}`;
    s.page.drawText(label, {
      x: PAGE.width - PAGE.margin - L.regular.widthOfTextAtSize(label, 10),
      y: s.y,
      size: 10,
      font: L.regular,
      color: MUTED,
    });
  }

  L.footers(`Dispute ${d.id}  ·  ${DEMO_SELLER.name}  ·  Prepared ${prepared}`);
  const bytes = await L.doc.save();
  if (bytes.length > PAYPAL_FILE_LIMIT) throw new Error(`Evidence PDF is ${(bytes.length / 1048576).toFixed(1)} MB; PayPal's limit is 10 MB.`);
  return { bytes, filename: `evidence-${d.id}.pdf`, pages: L.doc.getPageCount(), includedIds: records.map((r) => r.id) };
}
