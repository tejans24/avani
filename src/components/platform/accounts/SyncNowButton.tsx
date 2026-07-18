"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/platform/ds";

/** "Sync Mercury" button — POSTs /api/sync/mercury and refreshes the page. */
export function SyncNowButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sync() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/sync/mercury", { method: "POST" });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !body?.ok) {
        setError(body?.error ?? `Sync failed (HTTP ${res.status})`);
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <Button variant="secondary" size="sm" disabled={pending} onClick={sync}>
        {pending ? "Syncing…" : "Sync Mercury"}
      </Button>
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
    </span>
  );
}
