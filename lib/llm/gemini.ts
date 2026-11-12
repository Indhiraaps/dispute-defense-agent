/**
 * Gemini REST call with the resilience a live demo needs on the free tier:
 * a time limit per request, retries when a model is busy (429/503/timeout),
 * and backup models tried in order. Phase 3 uses the same model list.
 */

const RETRYABLE = new Set([429, 500, 503, 504]);
const TIMEOUT_MS = 30_000;
const TRIES_PER_MODEL = 2;

export function geminiModel(): string {
  return process.env.GEMINI_MODEL || "gemini-3.5-flash";
}

/** Main model first, then the backups from GEMINI_FALLBACK_MODELS (comma-separated). */
export function geminiModels(): string[] {
  const backups = (process.env.GEMINI_FALLBACK_MODELS ?? "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3-flash-preview")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set([geminiModel(), ...backups])];
}

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

async function callOnce(model: string, prompt: string, key: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new GeminiError(timedOut ? `${model} timed out after ${TIMEOUT_MS / 1000}s` : String(err), 0, true);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new GeminiError(`${model} ${res.status}: ${body?.error?.message ?? res.statusText}`, res.status, RETRYABLE.has(res.status));
  }
  const parts: { text?: string }[] = body?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? "").join("").trim();
}

/** Returns the reply text and which model produced it. */
export async function geminiTextWithModel(prompt: string): Promise<{ text: string; model: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set in .env (free key from aistudio.google.com).");

  const errors: string[] = [];
  for (const model of geminiModels()) {
    for (let attempt = 1; attempt <= TRIES_PER_MODEL; attempt++) {
      try {
        return { text: await callOnce(model, prompt, key), model };
      } catch (err) {
        const e = err instanceof GeminiError ? err : new GeminiError(String(err), 0, false);
        errors.push(e.message);
        if (!e.retryable) break; // e.g. 404 retired model or 400 bad request: move to the next model
        if (attempt < TRIES_PER_MODEL) await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  }
  throw new Error(`All Gemini models failed:\n  - ${errors.join("\n  - ")}`);
}

export async function geminiText(prompt: string): Promise<string> {
  return (await geminiTextWithModel(prompt)).text;
}
