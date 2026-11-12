import type Database from "better-sqlite3";
import { claimTypeForReason } from "../claims";
import { insertEvent, upsertDisputeRow } from "../db/rows";
import { DEMO_DISPUTES, DEMO_LISTINGS, DEMO_ORDERS } from "./demo-store";

const HOUR = 60 * 60 * 1000;

/**
 * Inserts the three demo disputes. Deadlines are set relative to now, so the
 * countdown always looks live no matter when the demo runs.
 */
export function seedDemoDisputes(db: Database.Database) {
  const now = Date.now();
  const tx = db.transaction(() => {
    for (const d of DEMO_DISPUTES) {
      const order = DEMO_ORDERS.find((o) => o.orderId === d.orderId)!;
      const listing = DEMO_LISTINGS.find((l) => l.sku === order.sku)!;
      const openedAt = new Date(now - d.openedDaysAgo * 24 * HOUR).toISOString();
      upsertDisputeRow(db, {
        id: d.id,
        source: "demo",
        claimType: claimTypeForReason(d.reason),
        reason: d.reason,
        buyerClaim: d.buyerClaim,
        paypalStatus: d.paypalStatus,
        stage: d.stage,
        amount: order.amount,
        currency: order.currency,
        itemName: listing.title,
        buyerName: order.buyerName,
        buyerCountry: order.buyerCountry,
        transactionId: order.transactionId,
        orderId: order.orderId,
        openedAt,
        sellerDueAt: new Date(now + d.dueInHours * HOUR).toISOString(),
        state: "NEW",
        outcome: null,
      });
      insertEvent(db, d.id, "dispute:opened", `Buyer opened the dispute: "${d.buyerClaim}"`, openedAt);
    }
  });
  tx();
}
