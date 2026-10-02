"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Result = { ok: boolean; error?: string; note?: string; id?: string };

/** Run a server action, surface its error/note, then refresh the page. */
export function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const run = (fn: () => Promise<Result>, after?: (r: Result) => void) => {
    setError(null);
    setNote(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.error ?? "Something went wrong");
        return;
      }
      if (r.note) setNote(r.note);
      if (after) after(r);
      else router.refresh();
    });
  };

  return { pending, error, note, run };
}

export function ActionMessage({ error, note }: { error: string | null; note?: string | null }) {
  if (!error && !note) return null;
  return (
    <span
      role={error ? "alert" : "status"}
      style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: error ? "var(--critical)" : "var(--positive)" }}
    >
      {error ?? note}
    </span>
  );
}
