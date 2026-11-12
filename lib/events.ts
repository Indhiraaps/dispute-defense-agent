import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { WebhookEvent } from "./paypal/webhooks";

/**
 * Temporary webhook log (one JSON object per line) until Phase 2 adds SQLite.
 */
const DATA_DIR = path.join(process.cwd(), "data");
const LOG_FILE = path.join(DATA_DIR, "webhook-events.jsonl");

export type LoggedEvent = { receivedAt: string; verified: boolean; event: WebhookEvent };

export async function logWebhookEvent(event: WebhookEvent, verified: boolean) {
  await mkdir(DATA_DIR, { recursive: true });
  const entry: LoggedEvent = { receivedAt: new Date().toISOString(), verified, event };
  await appendFile(LOG_FILE, JSON.stringify(entry) + "\n", "utf8");
}

export async function recentWebhookEvents(limit = 20): Promise<LoggedEvent[]> {
  try {
    const text = await readFile(LOG_FILE, "utf8");
    return text
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .map((line) => JSON.parse(line) as LoggedEvent)
      .reverse();
  } catch {
    return [];
  }
}
