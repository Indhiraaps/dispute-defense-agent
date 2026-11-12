import { getDisputeRaw } from "../db/repo";
import type { Dispute } from "../paypal/disputes";
import { DEMO_POLICY } from "../seed/demo-store";
import type { SellerDataSource } from "./types";

/**
 * Seller facts for a real sandbox dispute, read from the PayPal dispute object
 * saved at import. Tracking from PayPal's Shipment Tracking API is added in
 * Phase 3; listings and messages outside PayPal come from the seller's uploads.
 */
export const paypalSource: SellerDataSource = {
  label: "PayPal",

  async getPayment(d) {
    const tx = getDisputeRaw<Dispute>(d.id)?.disputed_transactions?.[0];
    if (!tx) return null;
    return {
      transactionId: tx.seller_transaction_id ?? d.transactionId,
      amount: tx.gross_amount?.value ?? d.amount,
      currency: tx.gross_amount?.currency_code ?? d.currency,
      paidAt: (tx.create_time ?? d.openedAt).slice(0, 10),
      buyerCountry: null,
      status: tx.transaction_status ?? null,
    };
  },

  async getOrder(d) {
    const tx = getDisputeRaw<Dispute>(d.id)?.disputed_transactions?.[0];
    if (!tx) return null;
    const items = (tx.items ?? []).map((i) => ({
      name: i.item_name ?? i.item_description ?? "Item",
      sku: i.item_id ?? null,
      quantity: Number(i.item_quantity ?? 1),
    }));
    return {
      orderId: tx.invoice_number || tx.custom || tx.seller_transaction_id || d.transactionId,
      items: items.length ? items : [{ name: d.itemName || "Item", sku: null, quantity: 1 }],
      shipTo: null,
      shippedAt: null,
      carrier: null,
      trackingNumber: null,
    };
  },

  async getListing() {
    return null;
  },

  async getMessages(d) {
    const msgs = getDisputeRaw<Dispute>(d.id)?.messages ?? [];
    return msgs.map((m, i) => ({
      ref: `paypal#${i + 1}`,
      from: m.posted_by === "SELLER" ? ("seller" as const) : ("buyer" as const),
      at: (m.time_posted ?? d.openedAt).slice(0, 10),
      text: m.content ?? "",
    }));
  },

  async getPolicy() {
    // The sandbox business account plays the demo seller, so it uses the same shop policy.
    return DEMO_POLICY;
  },

  async getPhotos() {
    // Buyer photos attached in PayPal are not downloadable through the API we use yet.
    return [];
  },
};
