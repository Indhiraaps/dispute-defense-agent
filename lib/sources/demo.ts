import { DEMO_LISTINGS, DEMO_MESSAGES, DEMO_ORDERS, DEMO_PHOTOS, DEMO_POLICY } from "../seed/demo-store";
import type { SellerDataSource } from "./types";

/** Reads the demo store export (stands in for a Shopify/Etsy CSV the seller uploads). */
export const demoSource: SellerDataSource = {
  label: "Seller store export",

  async getPayment(d) {
    const o = DEMO_ORDERS.find((x) => x.orderId === d.orderId);
    if (!o) return null;
    return {
      transactionId: o.transactionId,
      amount: o.amount,
      currency: o.currency,
      paidAt: o.paidAt,
      buyerCountry: o.buyerCountry,
      status: "COMPLETED",
    };
  },

  async getOrder(d) {
    const o = DEMO_ORDERS.find((x) => x.orderId === d.orderId);
    if (!o) return null;
    const listing = DEMO_LISTINGS.find((l) => l.sku === o.sku);
    return {
      orderId: o.orderId,
      items: [{ name: listing?.title ?? o.sku, sku: o.sku, quantity: o.quantity }],
      shipTo: o.shipTo,
      shippedAt: o.shippedAt,
      carrier: o.carrier,
      trackingNumber: o.trackingNumber,
    };
  },

  async getListing(_d, order) {
    const sku = order?.items[0]?.sku;
    const l = DEMO_LISTINGS.find((x) => x.sku === sku);
    return l ? { sku: l.sku, title: l.title, description: l.description, attributes: l.attributes, snapshotAt: l.snapshotAt } : null;
  },

  async getMessages(d) {
    return (DEMO_MESSAGES[d.orderId] ?? []).map((m, i) => ({ ref: `${d.orderId}#${i + 1}`, ...m }));
  },

  async getPolicy() {
    return DEMO_POLICY;
  },

  async getPhotos(d) {
    return DEMO_PHOTOS[d.orderId] ?? [];
  },
};
