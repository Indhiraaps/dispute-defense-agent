"use server";

import { refresh } from "next/cache";
import { runAgent } from "@/lib/agent/run";
import { approve, checkOptions, handleMyself, reopen, saveEditedDraft } from "@/lib/case/approval";
import { checkDraft } from "@/lib/case/check";
import { prepareCase } from "@/lib/case/prepare";
import type { CheckResult } from "@/lib/case/types";
import { getCaseFile, getDispute, listEvidence } from "@/lib/db/repo";
import { PayPalError } from "@/lib/paypal/client";
import { adjudicate, escalate } from "@/lib/paypal/disputes";
import { importDispute } from "@/lib/paypal/import";
import { simulateDemoDecision } from "@/lib/submit/outcomes";
import { submitApproved } from "@/lib/submit/submit";
import { collectEvidence } from "@/lib/evidence/collect";

function idFrom(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Missing dispute ID");
  return id;
}

export async function collectEvidenceAction(formData: FormData) {
  await collectEvidence(idFrom(formData));
  refresh();
}

export async function runAgentAction(formData: FormData) {
  const id = idFrom(formData);
  await runAgent(id);
  await prepareCase(id);
  refresh();
}

export async function redraftAction(formData: FormData) {
  await prepareCase(idFrom(formData));
  refresh();
}

export type CheckState = { result: CheckResult; saved: boolean } | null;

/** "Check citations" only checks. "Save edits" checks, and saves only if the text passes. */
export async function checkTextAction(_prev: CheckState, formData: FormData): Promise<CheckState> {
  const id = idFrom(formData);
  const text = String(formData.get("text") ?? "");
  if (formData.get("intent") === "save") {
    const result = saveEditedDraft(id, text);
    if (result.ok) refresh();
    return { result, saved: result.ok };
  }
  const file = getCaseFile(id);
  if (!file) throw new Error("This dispute has no draft yet.");
  return { result: checkDraft(text, listEvidence(id), checkOptions(file)), saved: false };
}

export type ActionState = { error: string | null };

async function guarded(fn: () => void): Promise<ActionState> {
  try {
    fn();
    refresh();
    return { error: null };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function approveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guarded(() => approve(idFrom(formData)));
}

export async function handleMyselfAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guarded(() => handleMyself(idFrom(formData)));
}

export async function reopenAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guarded(() => reopen(idFrom(formData)));
}

// ---------- Phase 7: sending to PayPal and following the outcome ----------

/** Turns a PayPal API error into a sentence the seller can act on. */
function friendlyError(err: unknown): string {
  if (err instanceof PayPalError) {
    const body = err.body as { details?: { issue?: string; description?: string }[]; message?: string } | undefined;
    const issue = body?.details?.[0]?.issue ?? "";
    if (issue === "ACTION_NOT_ALLOWED_IN_CURRENT_DISPUTE_STATE")
      return "PayPal isn't ready for this step yet: the dispute is still being processed on PayPal's side. Refresh in a few minutes and try again.";
    return `PayPal refused it: ${issue || body?.message || `HTTP ${err.status}`}${body?.details?.[0]?.description ? ` (${body.details[0].description})` : ""}${err.debugId ? `. Reference: ${err.debugId}` : ""}`;
  }
  return (err as Error).message;
}

async function guardedAsync(fn: () => Promise<unknown>): Promise<ActionState> {
  try {
    await fn();
    refresh();
    return { error: null };
  } catch (err) {
    refresh();
    return { error: friendlyError(err) };
  }
}

/** Approve, then send straight away. If sending fails, the approval stays and the seller can try again. */
export async function approveAndSendAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = idFrom(formData);
  return guardedAsync(async () => {
    approve(id);
    await submitApproved(id);
  });
}

export async function resendAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guardedAsync(() => submitApproved(idFrom(formData)));
}

export async function refreshFromPayPalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guardedAsync(() => importDispute(idFrom(formData), "manual refresh"));
}

export async function escalateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = idFrom(formData);
  return guardedAsync(async () => {
    await escalate(id, "The seller has provided evidence and asks PayPal to review this case.");
    await importDispute(id, "after escalate");
  });
}

/** Sandbox demo control: PayPal's decision. Real sandbox call for PayPal disputes, a labelled simulation for demo ones. */
export async function decideAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = idFrom(formData);
  const favour = formData.get("favour") === "BUYER" ? "BUYER" : "SELLER";
  return guardedAsync(async () => {
    if (getDispute(id)?.source === "demo") {
      simulateDemoDecision(id, favour);
      return;
    }
    await adjudicate(id, favour === "SELLER" ? "SELLER_FAVOR" : "BUYER_FAVOR");
    await importDispute(id, `sandbox decision: ${favour.toLowerCase()} favour`);
  });
}
