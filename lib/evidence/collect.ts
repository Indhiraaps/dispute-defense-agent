import { CARRIER_SOURCE_LABEL, lookupTracking } from "../carrier/mock";
import { countryName, formatDate, inCountry } from "../claims";
import { addEvent, getDispute, setState, upsertEvidence } from "../db/repo";
import { demoSource } from "../sources/demo";
import { paypalSource } from "../sources/paypal";
import type { CarrierTracking, OrderInfo, SellerDataSource } from "../sources/types";
import type { DisputeRow, EvidenceKind, EvidenceRecord } from "../types";

/** Evidence the collector can fetch. */
export const COLLECTABLE: EvidenceKind[] = [
  "payment",
  "order",
  "tracking",
  "delivery",
  "listing",
  "photo",
  "message",
  "policy",
];

const PHOTO_WHO_LABEL = { listing: "Listing photo", packing: "Packing photo", buyer: "Buyer's photo" } as const;

export type CollectResult = {
  records: EvidenceRecord[];
  /** Plain notes on what could not be found. The scorer uses these (e.g. "no tracking"). */
  missing: string[];
};

export function sourceFor(d: DisputeRow): SellerDataSource {
  return d.source === "demo" ? demoSource : paypalSource;
}

const normPostcode = (s: string) => s.replace(/\s+/g, "").toUpperCase();

/**
 * Gathers the requested kinds of evidence for one dispute and saves each fact
 * as a citable record. Safe to run again: records keep their IDs.
 * The Phase 3 agent calls this one kind at a time as tools.
 */
export async function collectEvidence(disputeId: string, kinds: EvidenceKind[] = COLLECTABLE): Promise<CollectResult> {
  const d = getDispute(disputeId);
  if (!d) throw new Error(`Unknown dispute ${disputeId}`);
  if (d.state === "NEW") setState(d.id, "GATHERING", "Started collecting evidence");

  const src = sourceFor(d);
  const records: EvidenceRecord[] = [];
  const missing: string[] = [];
  const want = new Set(kinds);

  // The order feeds tracking, delivery and listing, so fetch it whenever any of them is wanted.
  let order: OrderInfo | null = null;
  if (want.has("order") || want.has("tracking") || want.has("delivery") || want.has("listing")) {
    order = await src.getOrder(d);
  }

  if (want.has("payment")) {
    const p = await src.getPayment(d);
    if (!p) missing.push("No payment record found for this dispute.");
    else {
      records.push(
        upsertEvidence({
          disputeId: d.id,
          kind: "payment",
          sourceRef: `payment:${p.transactionId}`,
          source: d.source === "demo" ? "PayPal transaction record" : "PayPal Disputes API",
          title: `Payment ${p.transactionId}`,
          text: `PayPal payment ${p.transactionId} of ${p.amount} ${p.currency} on ${formatDate(p.paidAt)}${
            p.buyerCountry ? ` from a buyer in ${inCountry(p.buyerCountry)}` : ""
          }.`,
          facts: {
            transaction_id: p.transactionId,
            amount: p.amount,
            currency: p.currency,
            paid_at: p.paidAt,
            buyer_country: p.buyerCountry,
            status: p.status,
          },
        }),
      );
    }
  }

  if (want.has("order")) {
    if (!order) missing.push("No order record found.");
    else {
      const items = order.items.map((i) => `${i.quantity} × ${i.name}`).join(", ");
      const shipTo = order.shipTo
        ? ` Ship to ${order.shipTo.city} ${order.shipTo.postalCode}, ${countryName(order.shipTo.country)}.`
        : "";
      const shipped = order.shippedAt ? ` Marked shipped on ${formatDate(order.shippedAt)}.` : " Not marked as shipped.";
      records.push(
        upsertEvidence({
          disputeId: d.id,
          kind: "order",
          sourceRef: `order:${order.orderId}`,
          source: src.label,
          title: `Order ${order.orderId}`,
          text: `Order ${order.orderId}: ${items}.${shipTo}${shipped}`,
          facts: {
            order_id: order.orderId,
            items,
            ship_to_city: order.shipTo?.city ?? null,
            ship_to_postal_code: order.shipTo?.postalCode ?? null,
            ship_to_country: order.shipTo?.country ?? null,
            shipped_at: order.shippedAt,
            paid_at: (await src.getPayment(d))?.paidAt ?? null,
          },
        }),
      );
    }
  }

  let tracking: CarrierTracking | null = null;
  if (want.has("tracking") || want.has("delivery")) {
    if (!order?.trackingNumber) {
      missing.push("No tracking number was ever added to this order.");
    } else {
      tracking = await lookupTracking(order.trackingNumber);
      if (!tracking) missing.push(`Carrier has no record of tracking number ${order.trackingNumber}.`);
    }
  }

  if (want.has("tracking") && tracking && order) {
    const pickedUp = tracking.events[0];
    const match =
      !!order.shipTo && normPostcode(order.shipTo.postalCode) === normPostcode(tracking.destination.postalCode);
    records.push(
      upsertEvidence({
        disputeId: d.id,
        kind: "tracking",
        sourceRef: `tracking:${tracking.trackingNumber}`,
        source: CARRIER_SOURCE_LABEL,
        title: `${tracking.carrier} ${tracking.trackingNumber}`,
        text: `${tracking.carrier} tracking ${tracking.trackingNumber}, picked up in ${tracking.origin.city} on ${formatDate(
          pickedUp.at,
        )}, addressed to ${tracking.destination.city} ${tracking.destination.postalCode}${
          match ? ", matching the order's shipping address" : ", which does not match the order's shipping address"
        }.`,
        facts: {
          carrier: tracking.carrier,
          tracking_number: tracking.trackingNumber,
          picked_up_at: pickedUp.at,
          destination_postal_code: tracking.destination.postalCode,
          ship_to_postal_code: order.shipTo?.postalCode ?? null,
          address_match: match,
        },
      }),
    );
  }

  if (want.has("delivery") && tracking) {
    const last = tracking.events[tracking.events.length - 1];
    const del = tracking.delivered;
    const proof = del?.signedBy
      ? ` Signed for by ${del.signedBy}.`
      : del?.photo
        ? " Delivery photo recorded."
        : del
          ? " No signature or delivery photo recorded."
          : "";
    records.push(
      upsertEvidence({
        disputeId: d.id,
        kind: "delivery",
        sourceRef: `delivery:${tracking.trackingNumber}`,
        source: CARRIER_SOURCE_LABEL,
        title: del ? `Delivered ${formatDate(del.at)}` : `Latest status: ${last.status}`,
        text: del
          ? `${tracking.carrier} shows the parcel delivered in ${del.city} ${del.postalCode} on ${formatDate(del.at)}.${proof}`
          : `${tracking.carrier} latest status is "${last.status}" at ${last.location} on ${formatDate(last.at)}. Not delivered yet.`,
        facts: {
          delivered: !!del,
          delivered_at: del?.at ?? null,
          delivered_postal_code: del?.postalCode ?? null,
          signed_by: del?.signedBy ?? null,
          delivery_photo: del?.photo ?? false,
          latest_status: last.status,
        },
      }),
    );
  }

  if (want.has("listing")) {
    const l = await src.getListing(d, order);
    if (!l) missing.push("No listing snapshot available for the item.");
    else {
      const attrs = Object.entries(l.attributes)
        .map(([k, v]) => `${k}: ${v}`)
        .join("; ");
      records.push(
        upsertEvidence({
          disputeId: d.id,
          kind: "listing",
          sourceRef: `listing:${l.sku}`,
          source: src.label,
          title: l.title,
          text: `Listing "${l.title}" as captured on ${formatDate(l.snapshotAt)}: ${l.description} (${attrs})`,
          facts: { sku: l.sku, title: l.title, snapshot_at: l.snapshotAt, ...l.attributes },
        }),
      );
    }
  }

  if (want.has("photo")) {
    const photos = await src.getPhotos(d);
    if (photos.length === 0) missing.push("No photos from the seller or the buyer.");
    for (const p of photos) {
      records.push(
        upsertEvidence({
          disputeId: d.id,
          kind: "photo",
          sourceRef: `photo:${p.ref}`,
          source: p.who === "buyer" ? "Buyer's claim attachment" : "Seller's photos",
          title: `${PHOTO_WHO_LABEL[p.who]}, ${formatDate(p.takenAt)}`,
          text: `${PHOTO_WHO_LABEL[p.who]} (${formatDate(p.takenAt)}): ${p.caption}.`,
          facts: { who: p.who, path: p.path, taken_at: p.takenAt, caption: p.caption },
        }),
      );
    }
  }

  if (want.has("message")) {
    const msgs = await src.getMessages(d);
    if (msgs.length === 0) missing.push("No messages between buyer and seller.");
    for (const m of msgs) {
      records.push(
        upsertEvidence({
          disputeId: d.id,
          kind: "message",
          sourceRef: `message:${m.ref}`,
          source: d.source === "demo" ? "Store message thread" : "PayPal dispute messages",
          title: `${m.from === "buyer" ? "Buyer" : "Seller"} message, ${formatDate(m.at)}`,
          text: `${m.from === "buyer" ? "Buyer" : "Seller"} wrote on ${formatDate(m.at)}: "${m.text}"`,
          facts: { from: m.from, date: m.at, text: m.text },
        }),
      );
    }
  }

  if (want.has("policy")) {
    const p = await src.getPolicy(d);
    if (!p) missing.push("No shop policy uploaded.");
    else {
      records.push(
        upsertEvidence({
          disputeId: d.id,
          kind: "policy",
          sourceRef: `policy:${p.id}`,
          source: "Seller's published shop policy",
          title: "Returns and shipping policy",
          text: `Shop policy (updated ${formatDate(p.updatedAt)}): ${p.text}`,
          facts: { policy_id: p.id, updated_at: p.updatedAt, handling_days: p.handlingDays ?? null },
        }),
      );
    }
  }

  if (records.length) addEvent(d.id, "evidence:collected", `Saved ${records.map((r) => r.id).join(", ")}`);
  for (const m of missing) addEvent(d.id, "evidence:missing", m);
  return { records, missing };
}
