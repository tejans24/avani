import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { formatDateLong } from "@/lib/dates";
import { deriveDisplayStatus } from "@/lib/invoice-status";
import { StatusBadge } from "@/components/platform/StatusBadge";
import { InvoiceActions } from "@/components/platform/InvoiceActions";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const invoice = await db.invoice.findUnique({
    where: { id: params.id },
    include: { client: true },
  });
  if (!invoice) notFound();

  const display = deriveDisplayStatus(invoice);

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

      <div style={{ marginBottom: 24 }}>
        <InvoiceActions
          invoiceId={invoice.id}
          status={invoice.status}
          number={invoice.number}
          billingEmail={invoice.client.billingEmail}
          ccEmails={invoice.client.ccEmails}
        />
      </div>

      <iframe
        src={`/api/invoices/${invoice.id}/pdf`}
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
