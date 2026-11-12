import { DEMO_SHIPMENTS } from "../seed/demo-store";
import type { CarrierTracking } from "../sources/types";

/**
 * Mocked carrier lookup. The PayPal sandbox has no real carrier data, so the
 * demo uses fixed shipments. Say so on stage.
 */
export const CARRIER_SOURCE_LABEL = "Carrier tracking (mocked for the demo)";

export async function lookupTracking(trackingNumber: string): Promise<CarrierTracking | null> {
  return DEMO_SHIPMENTS.find((s) => s.trackingNumber === trackingNumber) ?? null;
}
