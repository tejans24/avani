"use client";

import { useRouter } from "next/navigation";
import { deleteJob, deleteNotForMe } from "@/actions/jobs";
import { Button } from "@/components/platform/ds";
import { ActionMessage, useAction } from "./useAction";

/** Delete one job (after a confirm). On its own page, goes back to the list afterward. */
export function DeleteJobButton({ postingId, title, backToList = false }: { postingId: string; title: string; backToList?: boolean }) {
  const router = useRouter();
  const { pending, error, run } = useAction();
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        aria-label={`Delete ${title}`}
        title="Delete permanently; refreshes won't bring it back"
        onClick={() => {
          if (!window.confirm(`Delete "${title}"? It won't come back on refresh.`)) return;
          run(() => deleteJob(postingId), backToList ? () => router.push("/jobs") : undefined);
        }}
      >
        {pending ? "Deleting…" : "Delete"}
      </Button>
      <ActionMessage error={error} />
    </span>
  );
}

/** "Delete all" under Not for me: clears the jobs you've ruled out (applied ones keep their history). */
export function DeleteNotForMeButton({ count }: { count: number }) {
  const { pending, error, note, run } = useAction();
  return (
    <span style={{ display: "inline-flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <Button
        type="button"
        variant="secondary"
        size="md"
        disabled={pending || count === 0}
        onClick={() => {
          if (!window.confirm(`Delete all ${count} jobs under Not for me? They won't come back on refresh.`)) return;
          run(() => deleteNotForMe());
        }}
      >
        {pending ? "Deleting…" : `Delete all ${count}`}
      </Button>
      <ActionMessage error={error} note={note} />
    </span>
  );
}
