"use server";

import { refresh } from "next/cache";
import { syncAllDisputes } from "@/lib/paypal/import";

export type SyncState = { message: string | null; error: string | null };

/** Pulls every dispute from the PayPal sandbox. The backup for missed webhooks. */
export async function syncAction(_prev: SyncState): Promise<SyncState> {
  try {
    const results = await syncAllDisputes();
    refresh();
    const fresh = results.filter((r) => r.isNew).length;
    return { message: `Checked ${results.length} PayPal dispute(s)${fresh ? `, ${fresh} new` : ""}.`, error: null };
  } catch (err) {
    return { message: null, error: (err as Error).message.split("\n")[0] };
  }
}
