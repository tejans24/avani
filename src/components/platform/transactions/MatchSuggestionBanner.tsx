"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/platform/ds";
import { formatCents } from "@/lib/money";
import { formatDateShort, formatDateLong } from "@/lib/dates";
import { confirmInvoiceMatch, unlinkInvoiceMatch } from "@/actions/match";
import type { MatchCandidate } from "@/lib/matching";

/**
 * Inline deposit→invoice match strips. Confirm calls confirmInvoiceMatch;
 * no router.refresh() afterwards — the action's revalidatePath already
 * streams the refreshed tree back with the POST response, and an extra
 * in-transition refresh races it (hangs the transition on Next 14.2; see
 * CategorySelect.tsx).
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

function ErrorNote({ message }: { message: string }) {
  return (
    <span role="alert" style={{ color: "var(--critical)" }}>
      {message}
    </span>
  );
}

/** Suggestion strip on /transactions: one deposit, its top invoice candidate. */
export function MatchSuggestionBanner({
  transactionId,
  candidate,
  amountCents,
  postedAtIso,
}: {
  transactionId: string;
  candidate: MatchCandidate;
  amountCents: number;
  postedAtIso: string;
}) {
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (hidden) return null;

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await confirmInvoiceMatch(transactionId, candidate.invoiceId);
      // `=== false` (not `else`) so the union narrows under strict:false.
      if (result.ok === false) setError(result.error);
      // On success the streamed revalidation removes this banner.
    });
  };

  return (
    <div style={stripStyle}>
      <span>
        <strong>{formatCents(amountCents)}</strong> deposit on {formatDateShort(postedAtIso)} —
        looks like {candidate.clientName}&apos;s payment for {candidate.number} (
        {candidate.confidence === "HIGH" ? "strong match" : "possible match"})
      </span>
      <Button type="button" size="sm" variant="primary" disabled={pending} onClick={confirm}>
        {pending ? "Confirming…" : "Confirm"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => setHidden(true)}
      >
        Dismiss
      </Button>
      {error && <ErrorNote message={error} />}
    </div>
  );
}

/** Reverse suggestion on the invoice detail page (SENT invoices only). */
export function InvoiceMatchConfirm({
  transactionId,
  invoiceId,
  amountCents,
  postedAtIso,
}: {
  transactionId: string;
  invoiceId: string;
  amountCents: number;
  postedAtIso: string;
}) {
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (hidden) return null;

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await confirmInvoiceMatch(transactionId, invoiceId);
      if (result.ok === false) setError(result.error);
      // On success the streamed revalidation re-renders the page as PAID.
    });
  };

  return (
    <div style={stripStyle}>
      <span>
        A <strong>{formatCents(amountCents)}</strong> deposit on {formatDateLong(postedAtIso)}{" "}
        looks like this payment
      </span>
      <Button type="button" size="sm" variant="primary" disabled={pending} onClick={confirm}>
        {pending ? "Confirming…" : "Confirm"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => setHidden(true)}
      >
        Dismiss
      </Button>
      {error && <ErrorNote message={error} />}
    </div>
  );
}

/** Undo button for invoices paid via a confirmed match (invoice detail page). */
export function InvoiceUnlinkButton({ transactionId }: { transactionId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const unlink = () => {
    setError(null);
    startTransition(async () => {
      const result = await unlinkInvoiceMatch(transactionId);
      if (result.ok === false) setError(result.error);
      // On success the streamed revalidation re-renders the page as SENT.
    });
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={unlink}>
        {pending ? "Unlinking…" : "Unlink payment"}
      </Button>
      {error && <ErrorNote message={error} />}
    </span>
  );
}
