import { citesIn, splitSentences } from "../case/check";
import { addEvent, addSubmission, getCaseFile, getDispute, listEvidence, setState } from "../db/repo";
import { PayPalError } from "../paypal/client";
import { acceptClaim, makeOffer, provideEvidence, type Evidence } from "../paypal/disputes";
import { importDispute } from "../paypal/import";
import { buildEvidencePacket } from "../pdf/packet";
import type { Submission, SubmitAction } from "./types";

/**
 * Step 9: send the approved response to PayPal.
 *   Contest -> POST /provide-evidence  (statement + evidence PDF + tracking)
 *   Offer   -> POST /make-offer        (partial refund + message to the buyer)
 *   Accept  -> POST /accept-claim      (concession note)
 * Only an approved dispute can be sent. Demo disputes are never sent: the
 * exact request is recorded as a preview instead.
 */

const NOTE_LIMIT = 2000; // PayPal's limit on note fields

/** Citations help a PayPal reviewer check the PDF, but read oddly in a message to the buyer. */
export function stripCitations(text: string): string {
  return text
    .replace(/\s*\[[A-Z]{3}-\d{3}(?:\s*,\s*[A-Z]{3}-\d{3})*\]/g, "")
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

const clip = (s: string) => (s.length > NOTE_LIMIT ? `${s.slice(0, NOTE_LIMIT - 1)}…` : s);

/** The same approval always produces the same request ID, so a retry can never submit twice. */
function requestIdFor(disputeId: string, action: SubmitAction, approvedAt: string) {
  return `dda-${disputeId}-${action}-${Date.parse(approvedAt)}`.slice(0, 100);
}

export async function submitApproved(disputeId: string): Promise<Submission> {
  const d = getDispute(disputeId);
  if (!d) throw new Error(`Unknown dispute ${disputeId}`);
  if (d.state !== "APPROVED") throw new Error(`Only an approved dispute can be sent. This one is "${d.state}".`);
  const file = getCaseFile(disputeId);
  if (!file?.approval) throw new Error("No approval found for this dispute.");

  const band = file.score.band;
  const action: SubmitAction = band === "CONTEST" ? "provide_evidence" : band === "OFFER" ? "make_offer" : "accept_claim";
  const requestId = requestIdFor(d.id, action, file.approval.at);
  const evidence = listEvidence(d.id);
  const base = { disputeId: d.id, at: new Date().toISOString(), mode: d.source === "demo" ? "demo" : "paypal", action, requestId } as const;

  // Build the request.
  let request: Record<string, unknown>;
  let send: () => Promise<{ data: unknown; debugId?: string }>;
  if (action === "provide_evidence") {
    const packet = await buildEvidencePacket(d.id);
    const trk = evidence.find((e) => e.kind === "tracking");
    const cited = new Set(splitSentences(file.draft.text).flatMap(citesIn));
    const item: Evidence = {
      evidence_type: file.draft.evidenceType ?? "OTHER",
      notes: clip(file.draft.text),
      documents: [{ name: packet.filename }],
      ...(trk && cited.has(trk.id)
        ? {
            evidence_info: {
              tracking_info: [
                { carrier_name: "OTHER", carrier_name_other: String(trk.facts.carrier ?? ""), tracking_number: String(trk.facts.tracking_number ?? "") },
              ],
            },
          }
        : {}),
    };
    request = { evidences: [item], file: { name: packet.filename, pages: packet.pages, bytes: packet.bytes.length, records: packet.includedIds } };
    send = () => provideEvidence(d.id, { evidences: [item] }, [{ name: packet.filename, data: packet.bytes, contentType: "application/pdf" }], "evidence_file", requestId);
  } else if (action === "make_offer") {
    const offer = file.score.offer!;
    const note = clip(stripCitations(file.draft.text));
    request = { offer_type: "REFUND", offer_amount: { currency_code: offer.currency, value: offer.amount }, note };
    send = () => makeOffer(d.id, { note, amount: { currency_code: offer.currency, value: offer.amount }, offerType: "REFUND", requestId });
  } else {
    const note = clip(stripCitations(file.draft.text));
    request = { note };
    send = () => acceptClaim(d.id, { note, requestId });
  }

  if (d.source === "demo") {
    const s: Submission = { ...base, ok: true, request, response: { note: "Demo dispute: not sent to PayPal." } };
    addSubmission(s);
    setState(d.id, "SUBMITTED", `Demo dispute: ${action} prepared but not sent to PayPal (no real dispute exists)`);
    return s;
  }

  try {
    const res = await send();
    let statusAfter: string | undefined;
    try {
      statusAfter = (await importDispute(d.id, `after ${action}`)).status; // refresh our copy from PayPal
    } catch {
      // the submission succeeded; a failed refresh is retried by the next sync or webhook
    }
    const s: Submission = { ...base, ok: true, request, response: res.data, debugId: res.debugId, paypalStatusAfter: statusAfter };
    addSubmission(s);
    setState(d.id, "SUBMITTED", `Sent to PayPal: ${action}${statusAfter ? `. PayPal status now ${statusAfter}` : ""}`);
    return s;
  } catch (err) {
    const message = err instanceof PayPalError ? err.describe() : (err as Error).message;
    const s: Submission = {
      ...base,
      ok: false,
      request,
      error: message,
      debugId: err instanceof PayPalError ? err.debugId : undefined,
      response: err instanceof PayPalError ? err.body : undefined,
    };
    addSubmission(s);
    addEvent(d.id, "submit:failed", message.split("\n").join(" "));
    throw new Error(`PayPal refused the ${action.replace("_", " ")}: ${message.split("\n").slice(0, 2).join(" ")}`);
  }
}
