import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PayPalError } from "../../lib/paypal/client";

// Load .env for scripts (Next.js loads it for the app itself).
if (existsSync(".env")) process.loadEnvFile(".env");

const RESULTS_DIR = path.join(process.cwd(), "spike-results");

/** Saves a raw API response so the Phase 0 findings can be checked later. */
export function saveResult(name: string, data: unknown): string {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(RESULTS_DIR, `${stamp}-${name}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2));
  return path.relative(process.cwd(), file);
}

export const ok = (msg: string) => console.log(`  ✔ ${msg}`);
export const bad = (msg: string) => console.log(`  ✘ ${msg}`);
export const info = (msg: string) => console.log(`    ${msg}`);
export const heading = (msg: string) => console.log(`\n${msg}`);

export function describeError(err: unknown): string {
  if (err instanceof PayPalError) return err.describe();
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Runs a script body and prints a readable error instead of a stack trace. */
export function run(main: () => Promise<void>) {
  main().catch((err) => {
    console.error(`\nFailed:\n${describeError(err)}`);
    if (err instanceof PayPalError) {
      const file = saveResult("error", { status: err.status, debugId: err.debugId, body: err.body });
      console.error(`Raw error saved to ${file}`);
    }
    process.exit(1);
  });
}

export function usage(text: string): never {
  console.log(text);
  process.exit(1);
}
