"use client";

import { refreshAwardQueryNow, setAwardQueryEnabled } from "@/actions/jobs";
import { Button } from "@/components/platform/ds";
import { ActionMessage, useAction } from "./useAction";

export function AwardQueryActions({ id, enabled }: { id: string; enabled: boolean }) {
  const { pending, error, note, run } = useAction();
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(() => refreshAwardQueryNow(id))}>
        {pending ? "Fetching…" : "Refresh"}
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setAwardQueryEnabled(id, !enabled))}>
        {enabled ? "Pause" : "Resume"}
      </Button>
      <ActionMessage error={error} note={note} />
    </span>
  );
}
