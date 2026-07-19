"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteInteraction } from "@/actions/interactions";

/** Delete control for a manually-logged interaction row. */
export function DeleteInteractionButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onDelete = () => {
    if (!confirm("Delete this timeline entry?")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteInteraction(id);
      if (result.ok === false) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={pending}
      style={{
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-xs)",
        color: error ? "var(--critical)" : "var(--text-muted)",
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
      }}
      title={error ?? "Delete entry"}
    >
      {pending ? "…" : error ? "Error" : "Delete"}
    </button>
  );
}
