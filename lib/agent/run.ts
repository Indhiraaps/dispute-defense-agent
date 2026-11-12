import { addEvent, getDispute, listEvidence, saveAnalysis } from "../db/repo";
import { gatherEvidence } from "./gather";
import { analyzeMessages } from "./messages";
import { comparePhotos } from "./photos";
import type { Analysis } from "./types";
import { fallbackSummary, understandComplaint } from "./understand";

/**
 * Runs the AI part of the flow for one dispute:
 *   2  understand the complaint
 *   3  gather evidence (tool-calling agent, with a rules safety net)
 *   3b read the messages (quotes checked word for word)
 *   3c compare photos (vision), for disputes that have them
 * Scoring and drafting come in Phase 4. If every AI model is down, each step
 * falls back to rules so the dispute still gets its evidence.
 */
export async function runAgent(disputeId: string, log: (line: string) => void = () => {}): Promise<Analysis> {
  const d = getDispute(disputeId);
  if (!d) throw new Error(`Unknown dispute ${disputeId}`);
  const models: Record<string, string> = {};
  addEvent(d.id, "agent:started", "AI agent started");

  // 2. Understand
  let summary;
  try {
    const r = await understandComplaint(d);
    summary = r.summary;
    models.summary = r.modelId;
  } catch (err) {
    summary = fallbackSummary(d);
    models.summary = "rules fallback";
    addEvent(d.id, "agent:fallback", `Summary by rules: ${(err as Error).message.split("\n")[0]}`);
  }
  addEvent(d.id, "agent:summary", summary.summary);
  log(`Summary: ${summary.summary}`);

  // 3. Gather
  const g = await gatherEvidence(d, summary);
  models.gathering = g.modelId;
  log(`Gathered with ${g.steps.length} tool call(s): ${g.steps.map((s) => s.tool).join(", ")}`);

  const evidence = listEvidence(d.id);

  // 3b. Messages
  let messageFindings: Analysis["messageFindings"] = [];
  let rejectedFindings = 0;
  try {
    const m = await analyzeMessages(evidence.filter((e) => e.kind === "message"));
    messageFindings = m.findings;
    rejectedFindings = m.rejected;
    models.messages = m.modelId;
    for (const f of m.findings) addEvent(d.id, "agent:message", `${f.evidenceId} ${f.signal}: "${f.quote}"`);
    if (m.rejected) addEvent(d.id, "agent:rejected", `${m.rejected} message finding(s) dropped: quote not found in the message`);
  } catch (err) {
    models.messages = "skipped (AI unavailable)";
    addEvent(d.id, "agent:fallback", `Message reading skipped: ${(err as Error).message.split("\n")[0]}`);
  }
  log(`Message findings: ${messageFindings.length} kept, ${rejectedFindings} rejected`);

  // 3c. Photos
  let photoFinding: Analysis["photoFinding"] = null;
  const photos = evidence.filter((e) => e.kind === "photo");
  if (photos.length) {
    try {
      const p = await comparePhotos({ photos, listing: evidence.find((e) => e.kind === "listing"), buyerClaim: d.buyerClaim });
      if (p) {
        photoFinding = p.finding;
        models.photos = p.modelId;
        addEvent(
          d.id,
          "agent:photos",
          `${p.finding.attribute}: ${p.finding.verdict} (confidence ${p.finding.confidence.toFixed(2)})`,
        );
      }
    } catch (err) {
      models.photos = "skipped (AI unavailable)";
      addEvent(d.id, "agent:fallback", `Photo comparison skipped: ${(err as Error).message.split("\n")[0]}`);
    }
    log(`Photo finding: ${photoFinding ? `${photoFinding.verdict} (${photoFinding.confidence})` : "none"}`);
  }

  const analysis: Analysis = {
    disputeId: d.id,
    summary,
    steps: g.steps,
    gatheringNote: g.note,
    messageFindings,
    rejectedFindings,
    photoFinding,
    models,
    updatedAt: new Date().toISOString(),
  };
  saveAnalysis(analysis);
  addEvent(d.id, "agent:finished", `Evidence ready: ${evidence.length} record(s)`);
  return analysis;
}
