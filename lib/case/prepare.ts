import { addEvent, getAnalysis, getDispute, listEvidence, saveCaseFile, setState } from "../db/repo";
import { writeDraft } from "./draft";
import { scoreCase } from "./score";
import type { CaseFile } from "./types";

const BAND_WORD = { CONTEST: "Contest", OFFER: "Offer a partial refund", ACCEPT: "Accept" } as const;

/**
 * Steps 4–6 for one dispute: score with rules, draft with AI, check every
 * citation, then wait for the seller. Nothing is sent to PayPal here.
 */
export async function prepareCase(disputeId: string, log: (line: string) => void = () => {}): Promise<CaseFile> {
  const d = getDispute(disputeId);
  if (!d) throw new Error(`Unknown dispute ${disputeId}`);
  const evidence = listEvidence(d.id);
  const analysis = getAnalysis(d.id);

  const score = scoreCase(d, evidence, analysis);
  const met = score.rules.filter((r) => r.met).map((r) => `${r.points > 0 ? "+" : ""}${r.points} ${r.label}`);
  setState(d.id, "SCORED", `Score ${score.score}: ${BAND_WORD[score.band]}${met.length ? ` (${met.join("; ")})` : ""}`);
  log(`Score ${score.score}/100 → ${BAND_WORD[score.band]}${score.offer ? ` ${score.offer.amount} ${score.offer.currency} (${score.offer.percent}%)` : ""}`);

  const draft = await writeDraft(d, evidence, analysis, score);
  setState(d.id, "DRAFTED", `Draft ${draft.check.ok ? "passed" : "failed"} the citation check after ${draft.attempts} attempt(s) (${draft.model})`);
  if (draft.removed.length) addEvent(d.id, "check:removed", `Removed ${draft.removed.length} sentence(s) that could not be proven`);
  log(`Draft: ${draft.check.ok ? "passed" : "FAILED"} the citation check, ${draft.check.sentences} sentence(s), ${draft.attempts} attempt(s), ${draft.model}`);

  const file: CaseFile = { disputeId: d.id, score, draft, updatedAt: new Date().toISOString() };
  saveCaseFile(file);
  setState(d.id, "AWAITING_APPROVAL", "Waiting for the seller to approve, edit or handle it themselves");
  return file;
}
