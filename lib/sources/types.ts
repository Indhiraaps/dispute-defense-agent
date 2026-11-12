import type { DisputeRow } from "../types";

/** Normalised seller data, whatever system it came from. */

export type PaymentInfo = {
  transactionId: string;
  amount: string;
  currency: string;
  paidAt: string; // YYYY-MM-DD
  buyerCountry: string | null;
  status: string | null;
};

export type OrderInfo = {
  orderId: string;
  items: { name: string; sku: string | null; quantity: number }[];
  shipTo: { city: string; postalCode: string; country: string } | null;
  shippedAt: string | null;
  carrier: string | null;
  trackingNumber: string | null;
};

export type ListingInfo = {
  sku: string;
  title: string;
  description: string;
  attributes: Record<string, string>;
  snapshotAt: string;
};

export type MessageInfo = { ref: string; from: "buyer" | "seller"; at: string; text: string };

export type PolicyInfo = { id: string; text: string; updatedAt: string; handlingDays?: number };

/** A photo the seller or buyer provided. path is relative to public/. */
export type PhotoInfo = {
  ref: string;
  who: "listing" | "packing" | "buyer";
  path: string;
  caption: string;
  takenAt: string;
};

/** Where a dispute's seller-side facts come from: the demo store, or PayPal plus the seller's uploads. */
export interface SellerDataSource {
  label: string;
  getPayment(d: DisputeRow): Promise<PaymentInfo | null>;
  getOrder(d: DisputeRow): Promise<OrderInfo | null>;
  getListing(d: DisputeRow, order: OrderInfo | null): Promise<ListingInfo | null>;
  getMessages(d: DisputeRow): Promise<MessageInfo[]>;
  getPolicy(d: DisputeRow): Promise<PolicyInfo | null>;
  getPhotos(d: DisputeRow): Promise<PhotoInfo[]>;
}

/** What a carrier reports for a tracking number. */
export type CarrierTracking = {
  carrier: string;
  trackingNumber: string;
  origin: { city: string; country: string };
  destination: { city: string; postalCode: string; country: string };
  events: { at: string; status: string; location: string }[];
  delivered: { at: string; city: string; postalCode: string; signedBy: string | null; photo: boolean } | null;
};
