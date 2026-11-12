"use client";

import { useActionState, useState } from "react";
import type { WorkflowState } from "@/lib/types";
import { approveAndSendAction, handleMyselfAction, reopenAction, resendAction, type ActionState } from "./actions";

export type SubmissionView = {
  at: string;
  ok: boolean;
  mode: "paypal" | "demo";
  action: string;
  requestId: string;
  error?: string;
  paypalStatusAfter?: string;
  request: Record<string, unknown>;
};

export type OutcomeView = { label: string; code: string; kind: string; demo: boolean };

type Props = {
  disputeId: string;
  source: "demo" | "paypal";
  state: WorkflowState;
  action: string; // what approving will do, in plain words
  draftOk: boolean;
  approvedAt: string | null;
  submission: SubmissionView | null;
  outcome: OutcomeView | null;
};

const ACTION_WORDS: Record<string, string> = {
  provide_evidence: "Evidence and statement sent",
  make_offer: "Partial refund offered",
  accept_claim: "Claim accepted",
};

function RequestPreview({ s }: { s: SubmissionView }) {
  return (
    <details>
      <summary>{s.mode === "demo" ? "The request that would be sent" : "What was sent"}</summary>
      <pre className="request">{JSON.stringify(s.request, null, 2)}</pre>
      <p className="muted small">
        PayPal-Request-Id: <code>{s.requestId}</code> (the same approval always reuses it, so a retry can never submit twice)
      </p>
    </details>
  );
}

/**
 * The seller's decision. Approving takes two clicks, needs a draft that passes
 * the citation check, and then sends the response to PayPal.
 */
export function ApprovalPanel({ disputeId, source, state, action, draftOk, approvedAt, submission, outcome }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [approveState, approveForm, approving] = useActionState<ActionState, FormData>(approveAndSendAction, { error: null });
  const [resendState, resendForm, resending] = useActionState<ActionState, FormData>(resendAction, { error: null });
  const [manualState, manualForm, manualPending] = useActionState<ActionState, FormData>(handleMyselfAction, { error: null });
  const [reopenState, reopenForm, reopening] = useActionState<ActionState, FormData>(reopenAction, { error: null });
  const error = approveState.error ?? resendState.error ?? manualState.error ?? reopenState.error;

  if (state === "RESOLVED") {
    return (
      <div className="stack">
        <p className={outcome?.kind === "won" ? "yes" : outcome?.kind === "lost" ? "no" : ""}>
          <strong>{outcome ? outcome.label : "Resolved by PayPal"}</strong>
          {outcome && <span className="muted small"> · {outcome.code}</span>}
          {outcome?.demo && <span className="muted small"> · demo decision, simulated</span>}
        </p>
        {submission?.ok && (
          <p className="muted small">
            {ACTION_WORDS[submission.action] ?? submission.action} on {new Date(submission.at).toLocaleString()}.
          </p>
        )}
        {submission && <RequestPreview s={submission} />}
      </div>
    );
  }

  if (state === "SUBMITTED" && submission) {
    return (
      <div className="stack">
        <p className="yes">
          ✓ {ACTION_WORDS[submission.action] ?? submission.action}
          {submission.mode === "paypal" ? " to PayPal" : ""} on {new Date(submission.at).toLocaleString()}.
        </p>
        {submission.mode === "demo" ? (
          <p className="muted small">This is a demo dispute, so nothing was sent to PayPal. Below is the exact request a real dispute would get.</p>
        ) : (
          <p className="muted small">
            PayPal status now: <strong>{submission.paypalStatusAfter ?? "checking…"}</strong>. PayPal&apos;s decision arrives by webhook or
            with &ldquo;Refresh from PayPal&rdquo;.
          </p>
        )}
        <RequestPreview s={submission} />
      </div>
    );
  }

  if (state === "APPROVED") {
    const failed = submission && !submission.ok;
    return (
      <div className="stack">
        <p>
          ✓ Approved{approvedAt ? ` on ${new Date(approvedAt).toLocaleString()}` : ""}: {action}.
        </p>
        {failed && (
          <div className="failed">
            <strong>PayPal refused it.</strong>
            <pre className="request">{submission.error}</pre>
          </div>
        )}
        <div className="row">
          <form action={resendForm}>
            <input type="hidden" name="id" value={disputeId} />
            <button type="submit" disabled={resending}>
              {resending ? "Sending…" : failed ? "Try sending again" : "Send to PayPal"}
            </button>
          </form>
          <form action={reopenForm}>
            <input type="hidden" name="id" value={disputeId} />
            <button type="submit" className="secondary" disabled={reopening}>
              Undo approval
            </button>
          </form>
        </div>
        {error && <p className="no small">{error}</p>}
      </div>
    );
  }

  if (state === "MANUAL") {
    return (
      <div className="stack">
        <p>You chose to handle this dispute yourself. The agent will not send anything.</p>
        <form action={reopenForm}>
          <input type="hidden" name="id" value={disputeId} />
          <button type="submit" className="secondary" disabled={reopening}>
            Reopen for review
          </button>
        </form>
        {error && <p className="no small">{error}</p>}
      </div>
    );
  }

  if (state !== "AWAITING_APPROVAL") {
    return <p className="muted">The agent hasn&apos;t finished this dispute yet. Run the agent to get a draft to approve.</p>;
  }

  return (
    <div className="stack">
      <p>
        <strong>Approving will:</strong> {action}.
        {source === "demo" && <span className="muted small"> (Demo dispute: the request is prepared and shown, not sent.)</span>}
      </p>
      {!draftOk && <p className="no small">The draft doesn&apos;t pass the citation check, so it can&apos;t be approved. Edit it below first.</p>}
      <div className="row">
        {!confirming ? (
          <button type="button" onClick={() => setConfirming(true)} disabled={!draftOk}>
            Approve and submit…
          </button>
        ) : (
          <form action={approveForm} className="row confirm">
            <input type="hidden" name="id" value={disputeId} />
            <span>{source === "demo" ? "Approve and prepare the request?" : "Send this to PayPal now?"}</span>
            <button type="submit" disabled={approving}>
              {approving ? "Sending…" : source === "demo" ? "Yes, approve" : "Yes, approve and send"}
            </button>
            <button type="button" className="secondary" onClick={() => setConfirming(false)} disabled={approving}>
              Cancel
            </button>
          </form>
        )}
        {!confirming && (
          <form action={manualForm}>
            <input type="hidden" name="id" value={disputeId} />
            <button type="submit" className="secondary" disabled={manualPending}>
              Handle it myself
            </button>
          </form>
        )}
      </div>
      {error && <p className="no small">{error}</p>}
    </div>
  );
}
