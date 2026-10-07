"use client";

import { evaluateNextMatches } from "@/actions/jobs";
import { Button } from "@/components/platform/ds";
import { ActionMessage, useAction } from "./useAction";

/** "Have Claude read the next few" remote matches: verdicts on the list without opening each job. */
export function EvaluateMatchesButton({ remaining }: { remaining: number }) {
  const { pending, error, note, run } = useAction();
  const n = Math.min(remaining, 4);
  // Stays mounted once everything is read, so the result message isn't lost.
  if (remaining === 0) return <ActionMessage error={error} note={note} />;
  return (
    <span style={{ display: "inline-flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <Button type="button" variant="secondary" size="md" disabled={pending || remaining === 0} onClick={() => run(() => evaluateNextMatches(n))}>
        {pending ? `Claude is reading ${n}…` : `Have Claude read the next ${n} remote`}
      </Button>
      <ActionMessage error={error} note={note} />
    </span>
  );
}
