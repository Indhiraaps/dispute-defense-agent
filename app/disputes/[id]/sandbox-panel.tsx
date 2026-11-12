"use client";

import { useActionState } from "react";
import { decideAction, escalateAction, refreshFromPayPalAction, type ActionState } from "./actions";

type Props = {
  disputeId: string;
  source: "demo" | "paypal";
  paypalStatus: string;
  allowed: string[]; // seller actions PayPal allows right now
  submitted: boolean;
  resolved: boolean;
};

/**
 * Controls that only exist for testing and demos. In real life, PayPal makes
 * the decision; the sandbox lets the seller trigger it to show the full loop.
 */
export function SandboxPanel({ disputeId, source, paypalStatus, allowed, submitted, resolved }: Props) {
  const [refreshState, refreshForm, refreshing] = useActionState<ActionState, FormData>(refreshFromPayPalAction, { error: null });
  const [escState, escForm, escalating] = useActionState<ActionState, FormData>(escalateAction, { error: null });
  const [decideState, decideForm, deciding] = useActionState<ActionState, FormData>(decideAction, { error: null });
  const error = refreshState.error ?? escState.error ?? decideState.error;
  // PayPal adds an "adjudicate" link only once the claim can be decided (often 30+ minutes
  // after it goes under review), so the buttons appear exactly when they will work.
  const canDecide = source === "demo" ? submitted && !resolved : allowed.includes("adjudicate");

  return (
    <div className="stack">
      {source === "paypal" ? (
        <p className="small">
          PayPal status: <strong>{paypalStatus || "unknown"}</strong>
          {allowed.length > 0 && <span className="muted"> · seller actions allowed: {allowed.join(", ")}</span>}
        </p>
      ) : (
        <p className="muted small">Demo dispute: decisions here are simulated and labelled as demo. Real disputes use the PayPal sandbox.</p>
      )}
      <div className="row">
        {source === "paypal" && (
          <form action={refreshForm}>
            <input type="hidden" name="id" value={disputeId} />
            <button type="submit" className="secondary" disabled={refreshing}>
              {refreshing ? "Refreshing…" : "Refresh from PayPal"}
            </button>
          </form>
        )}
        {source === "paypal" && allowed.includes("escalate") && (
          <form action={escForm}>
            <input type="hidden" name="id" value={disputeId} />
            <button type="submit" className="secondary" disabled={escalating}>
              {escalating ? "Escalating…" : "Escalate to a PayPal claim"}
            </button>
          </form>
        )}
        {canDecide && (
          <form action={decideForm} className="row">
            <input type="hidden" name="id" value={disputeId} />
            <span className="small">PayPal&apos;s decision (sandbox):</span>
            <button type="submit" name="favour" value="SELLER" disabled={deciding}>
              {deciding ? "Deciding…" : "Seller wins"}
            </button>
            <button type="submit" name="favour" value="BUYER" className="secondary" disabled={deciding}>
              Buyer wins
            </button>
          </form>
        )}
      </div>
      {!canDecide && !resolved && (
        <p className="muted small">
          {source === "paypal"
            ? "PayPal's decision can be triggered once PayPal marks the claim ready (it adds an adjudicate action, often 30+ minutes after review starts). Use Refresh from PayPal to check."
            : "Send the response first; then you can simulate PayPal's decision."}
        </p>
      )}
      {error && <p className="no small">{error}</p>}
    </div>
  );
}
