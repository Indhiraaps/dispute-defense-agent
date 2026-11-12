import { createGoogle } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import { geminiModels } from "./gemini";

/**
 * Gemini through the Vercel AI SDK, with the same busy-model protection as the
 * Phase 0 check: each model gets a time limit and one SDK retry, then the next
 * model in GEMINI_MODEL / GEMINI_FALLBACK_MODELS is tried.
 */

let provider: ReturnType<typeof createGoogle> | null = null;

function google() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set in .env (free key from aistudio.google.com).");
  provider ??= createGoogle({ apiKey });
  return provider;
}

/** Shared request settings for every agent call. */
export const CALL_SETTINGS = {
  maxRetries: 1,
  timeout: { stepMs: 45_000, totalMs: 120_000 },
} as const;

export class AllModelsFailedError extends Error {
  constructor(
    readonly task: string,
    readonly attempts: string[],
  ) {
    super(`All Gemini models failed for ${task}:\n  - ${attempts.join("\n  - ")}`);
    this.name = "AllModelsFailedError";
  }
}

function describe(err: unknown): string {
  if (err instanceof Error) {
    const status = (err as { statusCode?: number }).statusCode;
    return `${status ? `${status} ` : ""}${err.message.split("\n")[0].slice(0, 160)}`;
  }
  return String(err);
}

/**
 * A model that just failed (busy, timed out) is tried last for a few minutes,
 * so one overloaded model doesn't add a timeout to every step of a run.
 */
const COOLDOWN_MS = 5 * 60_000;
const cooldownUntil = new Map<string, number>();

function modelOrder(): string[] {
  const now = Date.now();
  const all = geminiModels();
  const ready = all.filter((m) => (cooldownUntil.get(m) ?? 0) <= now);
  const cooling = all.filter((m) => (cooldownUntil.get(m) ?? 0) > now);
  return [...ready, ...cooling];
}

/** Runs one AI task, moving to the next model if a model is busy, retired or returns unusable output. */
export async function withModelFallback<T>(
  task: string,
  run: (model: LanguageModel, modelId: string) => Promise<T>,
): Promise<{ value: T; modelId: string }> {
  const attempts: string[] = [];
  for (const modelId of modelOrder()) {
    try {
      const value = await run(google()(modelId), modelId);
      cooldownUntil.delete(modelId);
      return { value, modelId };
    } catch (err) {
      attempts.push(`${modelId}: ${describe(err)}`);
      cooldownUntil.set(modelId, Date.now() + COOLDOWN_MS);
    }
  }
  throw new AllModelsFailedError(task, attempts);
}
