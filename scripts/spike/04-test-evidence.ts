/**
 * Phase 0, step 4: find the request format PayPal accepts for provide-evidence.
 *
 *   npm run spike:evidence -- PP-D-12345 tracking
 *       Sends tracking info only (no file). Tests the JSON "input" part.
 *
 *   npm run spike:evidence -- PP-D-12345 file [partName]
 *       Sends tracking info plus a PDF. Without partName it tries several
 *       part names in turn and stops at the first one PayPal accepts.
 *
 * A successful call changes the dispute, so use a fresh dispute for each test.
 */
import { bad, describeError, heading, info, ok, run, saveResult, usage } from "./_shared";
import { allowedActions, getDispute, provideEvidence, type Evidence } from "../../lib/paypal/disputes";
import { buildSampleEvidencePdf } from "../../lib/pdf/sample-evidence";

const CANDIDATE_PART_NAMES = ["evidence_file", "evidence-file", "file1", "file"];

run(async () => {
  const [id, mode = "tracking", partArg] = process.argv.slice(2);
  if (!id || !["tracking", "file"].includes(mode)) {
    usage("Usage: npm run spike:evidence -- <dispute-id> tracking|file [partName]");
  }

  const before = await getDispute(id);
  heading(`Dispute ${id}: ${before.reason}, ${before.status}`);
  info(`Allowed actions: ${allowedActions(before).join(", ") || "none"}`);
  if (!allowedActions(before).includes("provide_evidence")) {
    bad("PayPal does not list provide_evidence for this dispute right now. Trying anyway to see the error.");
  }

  const evidence: Evidence = {
    evidence_type: "PROOF_OF_FULFILLMENT",
    evidence_info: { tracking_info: [{ carrier_name: "FEDEX", tracking_number: "122533485" }] },
    notes: "Shipped on 3 Nov via FedEx, tracking 122533485 [TRK-001]. Delivered on 6 Nov [TRK-002].",
  };

  if (mode === "tracking") {
    const res = await provideEvidence(id, { evidences: [evidence] });
    ok(`Accepted: HTTP ${res.status}`);
    info(`Saved: ${saveResult(`evidence-tracking-${id}`, res.data)}`);
  } else {
    const pdf = await buildSampleEvidencePdf(id);
    const file = { name: "evidence.pdf", data: pdf, contentType: "application/pdf" };
    const names = partArg ? [partArg] : CANDIDATE_PART_NAMES;
    let accepted: string | null = null;
    for (const name of names) {
      try {
        const res = await provideEvidence(id, { evidences: [{ ...evidence, documents: [{ name: file.name }] }] }, [file], name);
        ok(`Accepted with file part "${name}": HTTP ${res.status}`);
        info(`Saved: ${saveResult(`evidence-file-${id}`, { partName: name, response: res.data })}`);
        accepted = name;
        break;
      } catch (err) {
        bad(`Part name "${name}" rejected:\n${describeError(err)}`);
      }
    }
    if (!accepted) throw new Error("No part name was accepted. Check the errors above and the saved results.");
  }

  const after = await getDispute(id);
  heading(`After: ${after.status}`);
  info(`Allowed actions now: ${allowedActions(after).join(", ") || "none"}`);
  info("Write down what worked; Phase 7 uses it.");
});
