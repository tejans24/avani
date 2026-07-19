import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { formatDateLong, dateToIso } from "@/lib/dates";
import { deriveDisplayStatus } from "@/lib/invoice-status";
import { suggestionForInvoice } from "@/lib/match-data";
import { StatusBadge } from "@/components/platform/StatusBadge";
import { InvoiceActions } from "@/components/platform/InvoiceActions";
import {
  InvoiceMatchConfirm,
  InvoiceUnlinkButton,
} from "@/components/platform/transactions/MatchSuggestionBanner";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const invoice = await db.invoice.findUnique({
    where: { id: params.id },
    include: { client: true, matchedTransaction: { select: { id: true, postedAt: true } } },
  });
  if (!invoice) notFound();

  const display = deriveDisplayStatus(invoice);

  // Reverse suggestion: a SENT invoice may already have its payment sitting in
  // the bank feed — offer a one-click confirm right on the detail page.
  const suggestion =
    invoice.status === "SENT" ? await suggestionForInvoice(invoice.id) : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {invoice.number}
            <StatusBadge status={display} />
          </h1>
          <p className="sub">
            {invoice.client.name} · {formatCents(invoice.totalCents)} · due{" "}
            {formatDateLong(invoice.dueDate)}
            {invoice.paidAt && ` · paid ${formatDateLong(invoice.paidAt)}`}
          </p>
        </div>
      </div>

      {suggestion && (
        <div style={{ marginBottom: 16 }}>
          <InvoiceMatchConfirm
            transactionId={suggestion.transactionId}
            invoiceId={invoice.id}
            amountCents={suggestion.amountCents}
            postedAtIso={suggestion.postedAtIso}
          />
        </div>
      )}

      <div style={{ marginBottom: 24, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <InvoiceActions
          invoiceId={invoice.id}
          status={invoice.status}
          number={invoice.number}
          billingEmail={invoice.client.billingEmail}
          ccEmails={invoice.client.ccEmails}
        />
        {invoice.status === "PAID" && invoice.matchedTransaction && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
              color: "var(--text-muted)",
            }}
          >
            Paid by a {formatDateLong(dateToIso(invoice.matchedTransaction.postedAt))} deposit
            <InvoiceUnlinkButton transactionId={invoice.matchedTransaction.id} />
          </span>
        )}
      </div>

      <iframe
        src={`/api/invoices/${invoice.id}/pdf#toolbar=0&navpanes=0&view=FitH`}
        title={`${invoice.number} preview`}
        style={{
          width: "100%",
          height: "78vh",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-lg)",
          background: "white",
        }}
      />
    </>
  );
}
