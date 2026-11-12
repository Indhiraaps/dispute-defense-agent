"use client";

import { useActionState, useState } from "react";
import { checkTextAction, type CheckState } from "./actions";

/**
 * Lets the seller edit the draft, check it, and save it. Saving only works
 * when the text passes the citation check; the server checks again on save.
 * Try adding "The buyer is a known scammer." to see it blocked.
 */
export function CheckForm({ disputeId, initialText }: { disputeId: string; initialText: string }) {
  const [state, action, pending] = useActionState<CheckState, FormData>(checkTextAction, null);
  // Controlled, so the seller's edits survive the form reset React does after an action.
  const [text, setText] = useState(initialText);
  const result = state?.result;

  return (
    <form action={action} className="stack">
      <input type="hidden" name="id" value={disputeId} />
      <label htmlFor="draft-text" className="small muted">
        Edit the draft. Every sentence must cite a record, and its dates and numbers must match that record. Edits are saved only
        if they pass.
      </label>
      <textarea id="draft-text" name="text" rows={6} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="row">
        <button type="submit" name="intent" value="check" className="secondary" disabled={pending}>
          {pending ? "Checking…" : "Check citations"}
        </button>
        <button type="submit" name="intent" value="save" disabled={pending}>
          Save edits
        </button>
        {result && (
          <span className={result.ok ? "yes" : "no"} role="status">
            {result.ok
              ? state?.saved
                ? `Saved. ${result.sentences} sentence(s), every fact cited and matching its record.`
                : `Passed: ${result.sentences} sentence(s), every fact cited and matching its record.`
              : `Blocked: ${result.problems.length} problem(s). This text cannot be ${state?.saved === false ? "saved or " : ""}submitted.`}
          </span>
        )}
      </div>
      {result && !result.ok && (
        <ul className="problems">
          {result.problems.map((p, i) => (
            <li key={i}>
              {p.sentence > 0 ? (
                <>
                  <strong>Sentence {p.sentence}:</strong> &ldquo;{p.text}&rdquo; <span className="no">{p.issue}</span>
                </>
              ) : (
                <span className="no">{p.issue}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
