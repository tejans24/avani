"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setClientArchived } from "@/actions/clients";
import { Button } from "@/components/platform/ds";

/** Archive/Unarchive toggle shown on the client edit page. */
export function ClientRowActions({
  clientId,
  archived,
}: {
  clientId: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onToggle = () => {
    setError(null);
    startTransition(async () => {
      const result = await setClientArchived(clientId, !archived);
      // `=== false` (not `else`) so the union narrows under strict:false.
      if (result.ok === false) {
        setError(result.error);
        return;
      }
      router.push("/clients");
      router.refresh();
    });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {error && (
        <span
          role="alert"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-sm)",
            color: "var(--critical)",
          }}
        >
          {error}
        </span>
      )}
      <Button type="button" variant="secondary" size="sm" onClick={onToggle} disabled={pending}>
        {pending ? "Working…" : archived ? "Unarchive" : "Archive"}
      </Button>
    </div>
  );
}
