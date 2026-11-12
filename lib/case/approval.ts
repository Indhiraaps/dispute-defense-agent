import { addEvent, getCaseFile, getDispute, listEvidence, saveCaseFile, setState } from "../db/repo";
import { checkDraft } from "./check";
import type { CaseFile, CheckResult } from "./types";

/**
 * Step 8: the seller decides. Nothing reaches PayPal without an approval here,
 * and an approval is only possible for a draft that passes the citation check
 * at the moment of approving.
 */

function load(disputeId: string): CaseFile {
  const file = getCaseFile(disputeId);
  if (!file) throw new Error("This dispute has no draft yet. Run the agent first.");
  return file;
}

export function checkOptions(file: CaseFile) {
  const offer = file.score.offer;
  return {
    allowedTokens: offer ? [offer.amount, String(offer.percent)] : [],
    maxWords: file.score.band === "CONTEST" ? 150 : undefined,
  };
}

/** What approving will do, in plain words. */
export function describeAction(file: CaseFile): string {
  const d = getDispute(file.disputeId);
  if (file.score.band === "CONTEST") return "Contest the dispute: send the statement and the evidence PDF to PayPal";
  if (file.score.band === "OFFER")
    return `Offer the buyer a partial refund of ${file.score.offer?.amount} ${file.score.offer?.currency}, with the message`;
  return `Accept the claim and refund ${d?.amount} ${d?.currency}`;
}

/** Checks the seller's edited text and saves it only if it passes. */
export function saveEditedDraft(disputeId: string, text: string): CheckResult {
  const file = load(disputeId);
  const clean = text.replace(/\s+/g, " ").trim();
  const check = checkDraft(clean, listEvidence(disputeId), checkOptions(file));
  if (!check.ok) return check;
  saveCaseFile({
    ...file,
    draft: { ...file.draft, text: clean, check, removed: [], editedBySeller: true, model: "edited by the seller" },
    approval: null,
    updatedAt: new Date().toISOString(),
  });
  addEvent(disputeId, "draft:edited", `Seller edited the draft; it passed the citation check (${check.sentences} sentences)`);
  if (getDispute(disputeId)?.state === "APPROVED") setState(disputeId, "AWAITING_APPROVAL", "Edited after approval; needs approving again");
  return check;
}

export function approve(disputeId: string): CaseFile {
  const d = getDispute(disputeId);
  if (!d) throw new Error(`Unknown dispute ${disputeId}`);
  if (d.state !== "AWAITING_APPROVAL") throw new Error(`This dispute is "${d.state}", not waiting for approval.`);
  const file = load(disputeId);
  // Check again now: evidence could have changed since the draft was written.
  const check = checkDraft(file.draft.text, listEvidence(disputeId), checkOptions(file));
  if (!check.ok) throw new Error(`The draft no longer passes the citation check (${check.problems.length} problem(s)). Edit it first.`);
  const action = describeAction(file);
  const updated: CaseFile = { ...file, draft: { ...file.draft, check }, approval: { at: new Date().toISOString(), action }, updatedAt: new Date().toISOString() };
  saveCaseFile(updated);
  setState(disputeId, "APPROVED", `Seller approved: ${action}`);
  return updated;
}

export function handleMyself(disputeId: string) {
  const file = getCaseFile(disputeId);
  if (file) saveCaseFile({ ...file, approval: null, updatedAt: new Date().toISOString() });
  setState(disputeId, "MANUAL", "Seller chose to handle this dispute themselves; the agent will not send anything");
}

/** Undo an approval or a "handle it myself", before anything has been sent. */
export function reopen(disputeId: string) {
  const d = getDispute(disputeId);
  if (!d || !["APPROVED", "MANUAL"].includes(d.state)) throw new Error("Only an approved or manually handled dispute can be reopened.");
  const file = getCaseFile(disputeId);
  if (file) saveCaseFile({ ...file, approval: null, updatedAt: new Date().toISOString() });
  setState(disputeId, "AWAITING_APPROVAL", "Seller reopened the dispute for review");
}
