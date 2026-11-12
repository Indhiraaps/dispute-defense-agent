/**
 * Demo seller: "Asha's Handmade Store" in Jaipur. This stands in for the
 * seller's own store export (orders, listings, messages, policy) and for a
 * carrier's tracking system. All names and numbers are made up.
 *
 * The three disputes are built to land in the three recommendation bands:
 *   DEMO-1001 scarf   (item not received, strong evidence) -> Contest
 *   DEMO-1002 sweater (not as described, mixed evidence)   -> Offer
 *   DEMO-1003 mug     (item not received, no tracking)     -> Accept
 */

export type DemoListing = {
  sku: string;
  title: string;
  description: string;
  attributes: Record<string, string>;
  price: string;
  snapshotAt: string; // date the listing text was captured
};

export type DemoOrder = {
  orderId: string;
  transactionId: string;
  sku: string;
  quantity: number;
  amount: string;
  currency: string;
  paidAt: string;
  buyerName: string; // already shortened
  buyerCountry: string; // ISO code
  shipTo: { city: string; postalCode: string; country: string };
  shippedAt: string | null;
  carrier: string | null;
  trackingNumber: string | null;
};

export type DemoShipment = {
  carrier: string;
  trackingNumber: string;
  origin: { city: string; country: string };
  destination: { city: string; postalCode: string; country: string };
  events: { at: string; status: string; location: string }[];
  delivered: { at: string; city: string; postalCode: string; signedBy: string | null; photo: boolean } | null;
};

export type DemoMessage = { from: "buyer" | "seller"; at: string; text: string };

export type DemoDispute = {
  id: string;
  orderId: string;
  reason: string; // PayPal reason code
  buyerClaim: string;
  paypalStatus: string;
  stage: string;
  openedDaysAgo: number;
  dueInHours: number; // countdown shown on the dashboard
};

export const DEMO_SELLER = {
  name: "Asha's Handmade Store",
  city: "Jaipur",
  country: "IN",
  handlingDays: 3,
};

export const DEMO_POLICY = {
  id: "returns-2026-01",
  handlingDays: 3,
  updatedAt: "2026-01-15",
  text:
    "Returns accepted within 14 days of delivery for unused items. Our textiles are dyed by hand with natural dyes, " +
    "so colour can vary slightly between pieces and from screen photos. Orders ship within 3 business days.",
};

export const DEMO_LISTINGS: DemoListing[] = [
  {
    sku: "SCF-IND-01",
    title: "Hand-block printed cotton scarf, indigo",
    description: "Hand-block printed in Jaipur on soft cotton mulmul. Indigo with white floral print. 180 × 70 cm.",
    attributes: { color: "indigo", material: "cotton", size: "180 × 70 cm" },
    price: "120.00",
    snapshotAt: "2026-10-28",
  },
  {
    sku: "SWT-NVY-M",
    title: "Hand-knit merino sweater, navy",
    description:
      "Hand-knit merino wool sweater, naturally dyed navy blue. Size M. Natural dyes mean the shade can vary slightly between pieces.",
    attributes: { color: "navy", material: "merino wool", size: "M" },
    price: "80.00",
    snapshotAt: "2026-10-20",
  },
  {
    sku: "MUG-BLU-01",
    title: "Jaipur blue pottery mug",
    description: "Hand-painted blue pottery mug, 300 ml. Each piece is unique.",
    attributes: { color: "blue and white", material: "blue pottery", size: "300 ml" },
    price: "40.00",
    snapshotAt: "2026-10-12",
  },
];

export const DEMO_ORDERS: DemoOrder[] = [
  {
    orderId: "AHS-2041",
    transactionId: "5TY82917JD440813K",
    sku: "SCF-IND-01",
    quantity: 1,
    amount: "120.00",
    currency: "USD",
    paidAt: "2026-10-28",
    buyerName: "Lena M.",
    buyerCountry: "DE",
    shipTo: { city: "Berlin", postalCode: "10115", country: "DE" },
    shippedAt: "2026-10-30",
    carrier: "DHL Express",
    trackingNumber: "4719336502",
  },
  {
    orderId: "AHS-2033",
    transactionId: "8KM20455RT913522W",
    sku: "SWT-NVY-M",
    quantity: 1,
    amount: "80.00",
    currency: "USD",
    paidAt: "2026-10-20",
    buyerName: "Tom R.",
    buyerCountry: "GB",
    shipTo: { city: "Manchester", postalCode: "M1 1AE", country: "GB" },
    shippedAt: "2026-10-24",
    carrier: "India Post EMS",
    trackingNumber: "EM482913756IN",
  },
  {
    orderId: "AHS-2017",
    transactionId: "3HW61842PL207639B",
    sku: "MUG-BLU-01",
    quantity: 1,
    amount: "40.00",
    currency: "USD",
    paidAt: "2026-10-12",
    buyerName: "Sam K.",
    buyerCountry: "US",
    shipTo: { city: "Austin", postalCode: "78701", country: "US" },
    shippedAt: "2026-10-15",
    carrier: null, // sent by untracked letter post
    trackingNumber: null,
  },
];

/** What a carrier's tracking page would return. The demo has no real carrier API. */
export const DEMO_SHIPMENTS: DemoShipment[] = [
  {
    carrier: "DHL Express",
    trackingNumber: "4719336502",
    origin: { city: "Jaipur", country: "IN" },
    destination: { city: "Berlin", postalCode: "10115", country: "DE" },
    events: [
      { at: "2026-10-30", status: "Picked up", location: "Jaipur, IN" },
      { at: "2026-11-01", status: "Departed hub", location: "New Delhi, IN" },
      { at: "2026-11-03", status: "Cleared customs", location: "Leipzig, DE" },
      { at: "2026-11-04", status: "Delivered", location: "Berlin 10115, DE" },
    ],
    delivered: { at: "2026-11-04", city: "Berlin", postalCode: "10115", signedBy: null, photo: false },
  },
  {
    carrier: "India Post EMS",
    trackingNumber: "EM482913756IN",
    origin: { city: "Jaipur", country: "IN" },
    destination: { city: "Manchester", postalCode: "M1 1AE", country: "GB" },
    events: [
      { at: "2026-10-24", status: "Item booked", location: "Jaipur GPO, IN" },
      { at: "2026-10-27", status: "Dispatched abroad", location: "Mumbai, IN" },
      { at: "2026-11-01", status: "Arrived in destination country", location: "Coventry, GB" },
      { at: "2026-11-03", status: "Delivered", location: "Manchester M1 1AE, GB" },
    ],
    delivered: { at: "2026-11-03", city: "Manchester", postalCode: "M1 1AE", signedBy: "T. Reid", photo: false },
  },
];

export const DEMO_MESSAGES: Record<string, DemoMessage[]> = {
  "AHS-2041": [
    { from: "buyer", at: "2026-11-05", text: "Got it, love it! The colours are even nicer in person." },
  ],
  "AHS-2033": [
    { from: "buyer", at: "2026-11-04", text: "The sweater arrived but it looks almost black, not navy like the photos." },
    {
      from: "seller",
      at: "2026-11-04",
      text: "So sorry to hear that! Our dyes are natural so shades vary a little. Could you send a photo in daylight?",
    },
    { from: "buyer", at: "2026-11-06", text: "I've attached a photo to my PayPal claim. I'd like a refund." },
  ],
  "AHS-2017": [{ from: "buyer", at: "2026-11-02", text: "Hi, any update on my order? It's been three weeks." }],
};

/**
 * Photos per order (files in public/demo/). Generated placeholders made by
 * `npm run demo:photos`; replace them with real phone photos for the video.
 */
export const DEMO_PHOTOS: Record<
  string,
  { ref: string; who: "listing" | "packing" | "buyer"; path: string; caption: string; takenAt: string }[]
> = {
  "AHS-2033": [
    {
      ref: "AHS-2033#listing",
      who: "listing",
      path: "demo/sweater-listing.png",
      caption: "Listing photo of the navy merino sweater, taken in daylight",
      takenAt: "2026-10-20",
    },
    {
      ref: "AHS-2033#buyer",
      who: "buyer",
      path: "demo/sweater-buyer.png",
      caption: "Buyer's photo of the sweater received, attached to the claim",
      takenAt: "2026-11-06",
    },
  ],
};

export const DEMO_DISPUTES: DemoDispute[] = [
  {
    id: "DEMO-1001",
    orderId: "AHS-2041",
    reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
    buyerClaim: "I never received the scarf I paid for.",
    paypalStatus: "WAITING_FOR_SELLER_RESPONSE",
    stage: "INQUIRY",
    openedDaysAgo: 2,
    dueInHours: 8 * 24 + 5,
  },
  {
    id: "DEMO-1002",
    orderId: "AHS-2033",
    reason: "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED",
    buyerClaim: "The colour is wrong. The listing says navy but the sweater is black.",
    paypalStatus: "WAITING_FOR_SELLER_RESPONSE",
    stage: "INQUIRY",
    openedDaysAgo: 4,
    dueInHours: 6 * 24 + 2,
  },
  {
    id: "DEMO-1003",
    orderId: "AHS-2017",
    reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
    buyerClaim: "I ordered a mug three weeks ago and nothing has arrived.",
    paypalStatus: "WAITING_FOR_SELLER_RESPONSE",
    stage: "INQUIRY",
    openedDaysAgo: 7,
    dueInHours: 2 * 24 + 20,
  },
];
