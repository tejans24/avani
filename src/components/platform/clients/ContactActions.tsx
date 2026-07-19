"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setContactArchived } from "@/actions/contacts";

/** Edit link + archive/restore toggle for a contact card. */
export function ContactActions({
  clientId,
  contactId,
  archived,
}: {
  clientId: string;
  contactId: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onToggle = () => {
    setError(null);
    startTransition(async () => {
      const result = await setContactArchived(contactId, !archived);
      if (result.ok === false) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const linkStyle: React.CSSProperties = {
    fontFamily: "var(--font-sans)",
    fontSize: "var(--text-xs)",
    color: "var(--color-accent)",
    textDecoration: "none",
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      {error && (
        <span role="alert" style={{ ...linkStyle, color: "var(--critical)", cursor: "default" }}>
          {error}
        </span>
      )}
      <Link href={`/clients/${clientId}/contacts/${contactId}/edit`} style={linkStyle}>
        Edit
      </Link>
      <button type="button" onClick={onToggle} disabled={pending} style={linkStyle}>
        {pending ? "Working…" : archived ? "Restore" : "Archive"}
      </button>
    </div>
  );
}
