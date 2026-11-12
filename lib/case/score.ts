import type { Analysis } from "../agent/types";
import type { DisputeRow, EvidenceRecord } from "../types";
import type { Band, ScoreResult, ScoreRule } from "./types";

/**
 * Step 4: score how strong the seller's case is. Fixed rules, not AI, so the
 * result is consistent and every point can be traced to an evidence record.
 *   70 or more -> Contest   40 to 69 -> Offer a partial refund   below 40 -> Accept
 */

export const BANDS = { contest: 70, offer: 40 } as const;

const DEFAULT_HANDLING_DAYS = 3;

/** Weekdays after `fromIso` up to and including `toIso`. */
export function businessDaysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso.slice(0, 10)}T12:00:00Z`);
  const to = new Date(`${toIso.slice(0, 10)}T12:00:00Z`);
  let days = 0;
  for (const d = new Date(from); d < to; ) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) days++;
  }
  return days;
}

/** Which attribute a "not as described" claim is about. */
export function disputedAttribute(claim: string, photoAttribute?: string): "color" | "size" | "material" | "condition" | null {
  const text = `${photoAttribute ?? ""} ${claim}`.toLowerCase();
  if (/colou?r|navy|black|shade|dye/.test(text)) return "color";
  if (/size|fit|small|large|tight|loose/.test(text)) return "size";
  if (/material|fabric|wool|cotton|silk|polyester/.test(text)) return "material";
  if (/broken|damag|defect|crack|torn|stain/.test(text)) return "condition";
  return null;
}

const round5 = (n: number) => Math.round(n / 5) * 5;

export function bandFor(score: number): Band {
  if (score >= BANDS.contest) return "CONTEST";
  if (score >= BANDS.offer) return "OFFER";
  return "ACCEPT";
}

export function scoreCase(d: DisputeRow, evidence: EvidenceRecord[], analysis: Analysis | null): ScoreResult {
  const first = (kind: EvidenceRecord["kind"]) => evidence.find((e) => e.kind === kind);
  const trk = first("tracking");
  const dlv = first("delivery");
  const ord = first("order");
  const pol = first("policy");
  const lst = first("listing");
  const photos = evidence.filter((e) => e.kind === "photo");
  const findings = analysis?.messageFindings ?? [];
  const photo = analysis?.photoFinding ?? null;
  const ids = (xs: (EvidenceRecord | undefined)[]) => xs.filter((x): x is EvidenceRecord => !!x).map((x) => x.id);
  const findingIds = (signals: string[]) => [
    ...new Set(findings.filter((f) => signals.includes(f.signal)).map((f) => f.evidenceId)),
  ];

  const ack = findingIds(["BUYER_CONFIRMS_RECEIPT", "BUYER_ACCEPTS_ITEM"]);
  const admits = findingIds(["SELLER_ADMITS_FAULT"]);
  const delivered = dlv?.facts.delivered === true;
  const addressMatch = trk?.facts.address_match === true;

  const rules: ScoreRule[] = [];
  const add = (id: string, label: string, points: number, met: boolean, cites: string[]) =>
    rules.push({ id, label, points, met, cites: met ? cites : [] });

  if (d.claimType === "INR") {
    const paid = ord?.facts.paid_at;
    const shipped = ord?.facts.shipped_at;
    const handling = Number(pol?.facts.handling_days ?? DEFAULT_HANDLING_DAYS);
    const onTime =
      typeof paid === "string" && typeof shipped === "string" && businessDaysBetween(paid, shipped) <= handling;

    add("tracking_match", "Tracking number exists and matches the buyer's address", 30, !!trk && addressMatch, ids([trk]));
    add("delivered", "Carrier shows the parcel delivered", 30, delivered, ids([dlv]));
    add(
      "delivery_proof",
      "Delivery signature or photo exists",
      20,
      !!dlv && (!!dlv.facts.signed_by || dlv.facts.delivery_photo === true),
      ids([dlv]),
    );
    add("shipped_on_time", `Shipped within the stated handling time (${handling} business days)`, 10, onTime, ids([ord, pol]));
    add("buyer_ack", "Buyer's messages acknowledge receipt", 10, ack.length > 0, ack);
    add("no_tracking", "No tracking at all", -40, !trk, ids([ord]));
  } else if (d.claimType === "SNAD") {
    const attr = disputedAttribute(d.buyerClaim, photo?.attribute);
    const packing = photos.filter((p) => p.facts.who === "packing");
    const buyerPhotos = photos.filter((p) => p.facts.who === "buyer");
    const visionOk = !!photo && photo.verdict === "consistent" && photo.confidence >= 0.7;
    const disclosed = [lst, pol].filter((e) => e && /\bvar(y|ies|iation)\b/i.test(e.text));

    add(
      "listing_states_attribute",
      `Listing clearly states the disputed attribute${attr ? ` (${attr === "color" ? "colour" : attr})` : ""}`,
      30,
      !!lst && !!attr && !!lst.facts[attr],
      ids([lst]),
    );
    add("preship_photos_match", "Photos taken before shipping match the listing", 25, packing.length > 0 && visionOk, ids(packing));
    add("buyer_no_proof", "Buyer has not provided photos or proof", 15, buyerPhotos.length === 0, []);
    add("buyer_accepted", "Buyer accepted the item in messages", 15, findingIds(["BUYER_ACCEPTS_ITEM"]).length > 0, findingIds(["BUYER_ACCEPTS_ITEM"]));
    add(
      "vision_consistent",
      "AI photo check: buyer's photo is consistent with the listing (confidence 70% or more)",
      15,
      buyerPhotos.length > 0 && visionOk,
      photo?.citedIds ?? [],
    );
    add("variation_disclosed", "Listing or policy warns this can vary", 10, disclosed.length > 0, ids(disclosed));
  } else {
    add("delivered_matching", "Delivered to the matching address", 40, delivered && addressMatch, ids([trk, dlv]));
    add("buyer_ack", "Buyer's messages acknowledge receipt", 30, ack.length > 0, ack);
    add("tracking", "Tracking exists", 20, !!trk, ids([trk]));
  }
  add("seller_admits", "Seller's own messages admit a defect or mistake", -50, admits.length > 0, admits);

  const raw = rules.reduce((sum, r) => sum + (r.met ? r.points : 0), 0);
  const score = Math.max(0, Math.min(100, raw));
  const band = bandFor(score);

  let offer: ScoreResult["offer"] = null;
  if (band === "OFFER") {
    // Weaker case -> bigger refund, kept between 15% and 30% of the amount.
    const percent = Math.max(15, Math.min(30, round5((100 - score) * 0.5)));
    offer = { percent, amount: ((Number(d.amount) * percent) / 100).toFixed(2), currency: d.currency };
  }

  const advice: string[] = [];
  if (!trk) advice.push("Add tracking to every order. It is the strongest defence against \"item not received\" claims.");
  if (trk && !(dlv?.facts.signed_by || dlv?.facts.delivery_photo)) advice.push("For orders over $100, use signature confirmation.");
  if (d.claimType === "SNAD" && !photos.some((p) => p.facts.who === "packing"))
    advice.push("Photograph each item before packing. Pre-shipping photos win \"not as described\" claims.");

  return { score, band, rules, offer, advice };
}
