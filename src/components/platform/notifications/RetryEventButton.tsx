"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/platform/ds";
import { retryEvent } from "@/actions/notifications";

export function RetryEventButton({ eventId }: { eventId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await retryEvent(eventId);
            if (res.ok === false) setError(res.error);
            else setError(null);
          })
        }
      >
        {pending ? "Retrying…" : "Retry"}
      </Button>
      {error && (
        <span role="alert" style={{ color: "var(--critical)", fontSize: "var(--text-xs)" }}>
          {error}
        </span>
      )}
    </span>
  );
}
