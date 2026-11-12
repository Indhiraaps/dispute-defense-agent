"use client";

import { useFormStatus } from "react-dom";

/** A submit button that shows a waiting message while its form's server action runs. */
export function SubmitButton({ label, pendingLabel, secondary }: { label: string; pendingLabel: string; secondary?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={secondary ? "secondary" : undefined} aria-live="polite">
      {pending ? pendingLabel : label}
    </button>
  );
}
