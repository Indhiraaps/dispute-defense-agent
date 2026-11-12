import { generateText, Output } from "ai";
import { z } from "zod";
import type { Analysis } from "../agent/types";
import { CLAIM_LABEL, formatDate } from "../claims";
import { CALL_SETTINGS, withModelFallback } from "../llm/model";
import type { ClaimType, DisputeRow, EvidenceRecord } from "../types";
import { checkDraft, splitSentences } from "./check";
import type { Band, CheckResult, Draft, ScoreResult } from "./types";

/**
 * Step 5: write the response. Gemini writes it as sentences, each listing the
 * evidence IDs it relies on. The citation checker then tests it; failures go
 * back to the model with the exact problems (up to 3 drafts). Sentences that
 * still fail are removed. With no AI available, a template built from the
 * evidence text itself is used, which always passes.
 */

const MAX_ATTEMPTS = 3;
const MAX_WORDS = 150;

/** PayPal evidence type for a contest. Decided by rules; confirm the list in the sandbox (Phase 7). */
const EVIDENCE_TYPE: Record<ClaimType, string> = {
  INR: "PROOF_OF_FULFILLMENT",
  SNAD: "OTHER",
  UNAUTHORIZED: "PROOF_OF_FULFILLMENT",
  OTHER: "OTHER",
};

const schema = z.object({
  sentences: z.array(
    z.object({
      text: z.string().describe("One sentence. Do not put [ID] markers in the text; list them in cites."),
      cites: z.array(z.string()).describe("Evidence IDs this sentence relies on, e.g. ['TRK-001']. Empty only for a courtesy sentence."),
    }),
  ),
});

const BASE_RULES = `Rules you must follow:
- Every sentence that states a fact must list, in "cites", the evidence IDs that prove it. Only use IDs from the evidence list.
- Copy dates, amounts, tracking numbers and postcodes exactly as they appear in the cited records.
- When you use a message, say who wrote it and when, and quote their words, e.g. On 5 Nov 2026 the buyer wrote: "Got it, thanks!" Never present someone's words as a plain fact.
- State only what the records say. No guesses, no opinions about anyone's honesty, no threats.
- Courtesy sentences (for example "Thank you for your patience.") may have empty cites but must contain no facts or numbers.`;

function instructionsFor(band: Band, score: ScoreResult, d: DisputeRow): { instructions: string; audience: Draft["audience"] } {
  if (band === "CONTEST")
    return {
      audience: "paypal",
      instructions: `You write a seller's response to PayPal for a "${CLAIM_LABEL[d.claimType]}" dispute.
Write 3 to 6 sentences, at most ${MAX_WORDS} words in total, for a PayPal case reviewer. Lead with the strongest proof.
${BASE_RULES}`,
    };
  if (band === "OFFER")
    return {
      audience: "buyer",
      instructions: `You write a short, warm message from a small seller to a buyer who opened a "${CLAIM_LABEL[d.claimType]}" dispute.
Acknowledge the concern, mention one or two relevant facts from the records, and propose a partial refund of exactly ${score.offer!.amount} ${score.offer!.currency} (${score.offer!.percent}% of the price) while the buyer keeps the item.
The sentence with the refund amount must cite the payment record. 3 to 5 sentences.
${BASE_RULES}`,
    };
  return {
    audience: "paypal",
    instructions: `You write a brief, honest note from a seller to PayPal accepting a "${CLAIM_LABEL[d.claimType]}" claim.
2 or 3 sentences: say the seller accepts the claim, and state plainly (with citations) the facts that mean the seller cannot prove their side.
${BASE_RULES}`,
  };
}

/** Joins sentences into text with citations before the final full stop: "... delivered [DLV-001]." */
export function assemble(sentences: { text: string; cites: string[] }[]): string {
  return sentences
    .map(({ text, cites }) => {
      const clean = text.replace(/\s*\[[A-Z]{3}-\d{3}(?:\s*,\s*[A-Z]{3}-\d{3})*\]/g, "").trim();
      const ids = [...new Set(cites.map((c) => c.trim().toUpperCase()).filter(Boolean))];
      if (ids.length === 0) return clean;
      const cite = `[${ids.join(", ")}]`;
      // A sentence ending in a quote keeps the quote intact: ...in person." [MSG-001]
      if (/[.!?]["”]$/.test(clean)) return `${clean} ${cite}`;
      const m = clean.match(/^(.*?)([.!?])$/);
      return m ? `${m[1]} ${cite}${m[2]}` : `${clean} ${cite}.`;
    })
    .join(" ");
}

function evidenceList(evidence: EvidenceRecord[]) {
  return evidence.map((e) => `[${e.id}] ${e.text}`).join("\n");
}

function context(d: DisputeRow, evidence: EvidenceRecord[], analysis: Analysis | null, score: ScoreResult) {
  const met = score.rules.filter((r) => r.met).map((r) => `- ${r.label} (${r.points > 0 ? "+" : ""}${r.points})${r.cites.length ? ` [${r.cites.join(", ")}]` : ""}`);
  const unmet = score.rules.filter((r) => !r.met && r.points > 0).map((r) => `- ${r.label}`);
  return [
    `Dispute ${d.id}: ${CLAIM_LABEL[d.claimType]}, ${d.amount} ${d.currency}, item "${d.itemName}".`,
    `Buyer's claim: "${d.buyerClaim}"`,
    analysis?.summary ? `Summary: ${analysis.summary.summary}` : "",
    `Case score ${score.score}/100. Points in the seller's favour:\n${met.join("\n") || "- none"}`,
    unmet.length ? `Not available:\n${unmet.join("\n")}` : "",
    analysis?.photoFinding
      ? `Photo check: ${analysis.photoFinding.verdict} (${analysis.photoFinding.factors}) [${analysis.photoFinding.citedIds.join(", ")}]`
      : "",
    `Evidence (cite these IDs only):\n${evidenceList(evidence)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * A draft written from the evidence facts by fixed sentences, used when no AI
 * model is reachable. It states only the points that scored, so it reads like
 * a real response and always passes the citation check.
 */
export function templateDraft(
  d: DisputeRow,
  evidence: EvidenceRecord[],
  score: ScoreResult,
  analysis: Analysis | null = null,
): string {
  const first = (kind: EvidenceRecord["kind"]) => evidence.find((e) => e.kind === kind);
  const met = (id: string) => score.rules.some((r) => r.id === id && r.met);
  const pay = first("payment");
  const ord = first("order");
  const trk = first("tracking");
  const dlv = first("delivery");
  const pol = first("policy");
  const lst = first("listing");
  const f = (e: EvidenceRecord | undefined, k: string) => (e ? String(e.facts[k] ?? "") : "");
  const date = (e: EvidenceRecord | undefined, k: string) => (f(e, k) ? formatDate(f(e, k)) : "");
  const s: { text: string; cites: string[] }[] = [];
  const ackQuote = analysis?.messageFindings.find((x) => x.signal === "BUYER_CONFIRMS_RECEIPT" || x.signal === "BUYER_ACCEPTS_ITEM");

  if (score.band === "CONTEST" || (score.band === "OFFER" && d.claimType !== "SNAD")) {
    if (trk && met("tracking_match"))
      s.push({
        text: `The order was sent with ${f(trk, "carrier")} tracking ${f(trk, "tracking_number")} on ${date(trk, "picked_up_at")}, addressed to postcode ${f(trk, "destination_postal_code")}, which matches the buyer's shipping address.`,
        cites: [trk.id],
      });
    if (dlv && met("delivered"))
      s.push({ text: `The carrier shows the parcel delivered to postcode ${f(dlv, "delivered_postal_code")} on ${date(dlv, "delivered_at")}.`, cites: [dlv.id] });
    if (dlv && met("delivery_proof") && f(dlv, "signed_by"))
      s.push({ text: `The delivery was signed for by ${f(dlv, "signed_by")}.`, cites: [dlv.id] });
    if (ord && pol && met("shipped_on_time"))
      s.push({
        text: `It was paid for on ${date(ord, "paid_at")} and marked shipped on ${date(ord, "shipped_at")}, within the shop's stated handling time of ${f(pol, "handling_days")} business days.`,
        cites: [ord.id, pol.id],
      });
    const ackMsg = ackQuote && evidence.find((e) => e.id === ackQuote.evidenceId);
    if (ackQuote && ackMsg)
      s.push({ text: `On ${date(ackMsg, "date")} the buyer wrote: "${f(ackMsg, "text") || ackQuote.quote}"`, cites: [ackMsg.id] });
  }

  if (score.band === "CONTEST" && d.claimType === "SNAD") {
    if (lst && met("listing_states_attribute")) s.push({ text: `The listing "${f(lst, "title")}" stated the item clearly.`, cites: [lst.id] });
    const disclosed = [pol, lst].find((e) => e && /\bvar(y|ies|iation)\b/i.test(e.text));
    const line = disclosed && splitSentences(disclosed.text).find((x) => /\bvar(y|ies|iation)\b/i.test(x));
    if (disclosed && line) s.push({ text: line, cites: [disclosed.id] });
  }

  if (score.band === "OFFER") {
    s.unshift({ text: "Thank you for letting us know about this.", cites: [] });
    if (d.claimType === "SNAD") {
      if (lst) s.push({ text: `The listing "${f(lst, "title")}" describes the item you received.`, cites: [lst.id] });
      const disclosed = [pol, lst].find((e) => e && /\bvar(y|ies|iation)\b/i.test(e.text));
      const line = disclosed && splitSentences(disclosed.text).find((x) => /\bvar(y|ies|iation)\b/i.test(x));
      if (disclosed && line) s.push({ text: line, cites: [disclosed.id] });
    }
    if (pay)
      s.push({
        text: `We would like to offer a partial refund of ${score.offer!.amount} ${score.offer!.currency} on your payment of ${f(pay, "amount")} ${f(pay, "currency")}, and you keep the item.`,
        cites: [pay.id],
      });
  }

  if (score.band === "ACCEPT") {
    if (pay) s.push({ text: `The seller accepts this claim for the payment of ${f(pay, "amount")} ${f(pay, "currency")}.`, cites: [pay.id] });
    if (ord && !trk) s.push({ text: `Order ${f(ord, "order_id")} has no tracking number, so delivery cannot be proven.`, cites: [ord.id] });
    else if (ord) s.push({ text: `The seller cannot prove the order matched the buyer's expectations.`, cites: [ord.id] });
  }

  // Never return an empty draft: fall back to the records' own words.
  if (s.length === 0) for (const e of [pay, ord].filter((x): x is EvidenceRecord => !!x)) s.push(...splitSentences(e.text).map((text) => ({ text, cites: [e.id] })));
  return assemble(s);
}

export async function writeDraft(
  d: DisputeRow,
  evidence: EvidenceRecord[],
  analysis: Analysis | null,
  score: ScoreResult,
): Promise<Draft> {
  const { instructions, audience } = instructionsFor(score.band, score, d);
  const allowedTokens = score.offer ? [score.offer.amount, String(score.offer.percent)] : [];
  const checkOpts = { allowedTokens, maxWords: score.band === "CONTEST" ? MAX_WORDS : undefined };
  const base = context(d, evidence, analysis, score);
  const evidenceType = score.band === "CONTEST" ? EVIDENCE_TYPE[d.claimType] : null;

  let text = "";
  let check: CheckResult | null = null;
  let attempts = 0;
  let model = "";
  try {
    for (attempts = 1; attempts <= MAX_ATTEMPTS; attempts++) {
      const feedback =
        check && !check.ok
          ? `\n\nYour previous draft failed the citation check. Fix or remove these sentences:\n${check.problems
              .map((p) => `- ${p.sentence ? `Sentence ${p.sentence} ("${p.text}")` : "Whole draft"}: ${p.issue}`)
              .join("\n")}\nPrevious draft:\n${text}`
          : "";
      const res = await withModelFallback("drafting", async (m) => {
        const { output } = await generateText({
          model: m,
          instructions,
          prompt: base + feedback,
          output: Output.object({ schema }),
          ...CALL_SETTINGS,
        });
        return output.sentences;
      });
      model = res.modelId;
      text = assemble(res.value);
      check = checkDraft(text, evidence, checkOpts);
      if (check.ok) break;
    }
  } catch {
    // Every model failed: use the template, which is built from the records themselves.
    text = templateDraft(d, evidence, score, analysis);
    check = checkDraft(text, evidence, checkOpts);
    return { band: score.band, audience, text, evidenceType, check, attempts, removed: [], model: "template (AI unavailable)" };
  }

  attempts = Math.min(attempts, MAX_ATTEMPTS);
  let removed: string[] = [];
  if (check && !check.ok) {
    // Drop the sentences that never passed. If nothing is left, fall back to the template.
    const bad = new Set(check.problems.map((p) => p.sentence).filter((n) => n > 0));
    const sentences = splitSentences(text);
    removed = sentences.filter((_, i) => bad.has(i + 1));
    const kept = sentences.filter((_, i) => !bad.has(i + 1)).join(" ");
    const keptCheck = kept ? checkDraft(kept, evidence, checkOpts) : null;
    if (keptCheck?.ok) {
      text = kept;
      check = keptCheck;
    } else {
      text = templateDraft(d, evidence, score, analysis);
      check = checkDraft(text, evidence, checkOpts);
      model = `${model}, then template`;
    }
  }
  return { band: score.band, audience, text, evidenceType, check: check!, attempts, removed, model };
}
