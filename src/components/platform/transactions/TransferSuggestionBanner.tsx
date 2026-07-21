"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/platform/ds";
import { formatCents } from "@/lib/money";
import { formatDateShort } from "@/lib/dates";
import { confirmTransfer } from "@/actions/transfer";
import type { TransferPair } from "@/lib/transfer-data";

/**
 * Inline account-to-account transfer strip on /transactions. Confirming books
 * both legs as "Transfer Between Accounts" so neither double-counts in P&L.
 * No router.refresh() — the action's revalidatePath streams the refreshed tree
 * back (see MatchSuggestionBanner for the rationale).
 */
const stripStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 10,
  padding: "10px 14px",
  background: "var(--cream)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-md)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-sm)",
  color: "var(--text-primary)",
};

export function TransferSuggestionBanner({ pair }: { pair: TransferPair }) {
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (hidden) return null;

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await confirmTransfer(pair.a.transactionId, pair.b.transactionId);
      if (result.ok === false) setError(result.error);
      // On success the streamed revalidation removes this banner.
    });
  };

  const amount = Math.abs(pair.a.amountCents);

  return (
    <div style={stripStyle} data-testid="transfer-suggestion">
      <span>
        <strong>{formatCents(amount)}</strong> out of {pair.a.accountName} on{" "}
        {formatDateShort(pair.a.postedAtIso)} looks like a transfer to {pair.b.accountName} — book
        both as a transfer (won&apos;t count in P&amp;L)
      </span>
      <Button type="button" size="sm" variant="primary" disabled={pending} onClick={confirm}>
        {pending ? "Confirming…" : "It's a transfer"}
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setHidden(true)}>
        Dismiss
      </Button>
      {error && (
        <span role="alert" style={{ color: "var(--critical)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
