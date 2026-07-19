import { notFound } from "next/navigation";
import { invoiceByShareToken, recordInvoiceView } from "@/lib/share-invoice";
import { settingsToSnapshot } from "@/pdf/render";
import { db } from "@/lib/db";
import { formatCents, formatBps } from "@/lib/money";
import { formatDateLong } from "@/lib/dates";
import { deriveDisplayStatus } from "@/lib/invoice-status";

export const dynamic = "force-dynamic";

// Never index client invoice pages.
export const metadata = {
  robots: { index: false, follow: false },
  title: "Invoice",
};

const wrap: React.CSSProperties = {
  minHeight: "100vh",
  background: "var(--bone)",
  padding: "48px 16px",
  fontFamily: "var(--font-sans)",
  color: "var(--ink)",
};

const card: React.CSSProperties = {
  maxWidth: 640,
  margin: "0 auto",
  background: "var(--warm-white)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-lg)",
  overflow: "hidden",
};

function quantityStr(q: unknown): string {
  const n = Number(q);
  return Number.isInteger(n) ? String(n) : String(n);
}

export default async function SharedInvoicePage({
  params,
}: {
  params: { token: string };
}) {
  const invoice = await invoiceByShareToken(params.token);
  if (!invoice) notFound();

  const settings = await db.companySettings.findUniqueOrThrow({ where: { id: 1 } });
  const from =
    (invoice.fromSnapshot as ReturnType<typeof settingsToSnapshot> | null) ??
    settingsToSnapshot(settings);
  const status = deriveDisplayStatus(invoice);
  const paid = invoice.status === "PAID";

  await recordInvoiceView(invoice);

  return (
    <main style={wrap}>
      <div style={card}>
        <div
          style={{
            background: "var(--forest)",
            color: "#EFEDE2",
            padding: "18px 28px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)" }}>
            {from.companyName}
          </span>
          <span
            data-testid="share-status"
            style={{
              background: paid ? "#E3EADF" : "rgba(239,237,226,0.14)",
              color: paid ? "var(--positive)" : "#EFEDE2",
              borderRadius: "var(--radius-full)",
              padding: "5px 12px",
              fontSize: "var(--text-xs)",
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            {paid
              ? `Paid${invoice.paidAt ? ` ${formatDateLong(invoice.paidAt)}` : ""}`
              : status === "OVERDUE"
                ? "Payment due"
                : "Awaiting payment"}
          </span>
        </div>

        <div style={{ padding: "28px" }}>
          <p
            style={{
              margin: "0 0 4px",
              fontSize: "var(--text-xs)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--ink-muted)",
            }}
          >
            Invoice {invoice.number}
          </p>
          <p
            style={{
              margin: "0 0 4px",
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-3xl)",
              color: "var(--forest)",
            }}
          >
            {formatCents(invoice.totalCents)}
          </p>
          <p style={{ margin: "0 0 24px", fontSize: "var(--text-sm)", color: "var(--ink-soft)" }}>
            Billed to {invoice.client.name} · due {formatDateLong(invoice.dueDate)}
          </p>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
            <thead>
              <tr>
                {["Description", "Hours", "Rate", "Amount"].map((h, i) => (
                  <th
                    key={h}
                    style={{
                      textAlign: i === 0 ? "left" : "right",
                      padding: "8px 0",
                      borderBottom: "1px solid var(--border-default)",
                      fontSize: "var(--text-xs)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--ink-muted)",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((li) => (
                <tr key={li.id}>
                  <td style={{ padding: "10px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                    {li.description}
                  </td>
                  <td style={{ textAlign: "right", borderBottom: "1px solid var(--border-subtle)" }}>
                    {quantityStr(li.quantity)}
                  </td>
                  <td style={{ textAlign: "right", borderBottom: "1px solid var(--border-subtle)" }}>
                    {formatCents(li.unitPriceCents)}
                  </td>
                  <td style={{ textAlign: "right", borderBottom: "1px solid var(--border-subtle)" }}>
                    {formatCents(li.amountCents)}
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={3} style={{ textAlign: "right", padding: "10px 0", color: "var(--ink-soft)" }}>
                  Subtotal
                </td>
                <td style={{ textAlign: "right" }}>{formatCents(invoice.subtotalCents)}</td>
              </tr>
              {invoice.taxCents > 0 && (
                <tr>
                  <td colSpan={3} style={{ textAlign: "right", padding: "4px 0", color: "var(--ink-soft)" }}>
                    Sales tax ({formatBps(invoice.taxRateBps)})
                  </td>
                  <td style={{ textAlign: "right" }}>{formatCents(invoice.taxCents)}</td>
                </tr>
              )}
              <tr>
                <td
                  colSpan={3}
                  style={{
                    textAlign: "right",
                    padding: "10px 0",
                    fontWeight: 700,
                    borderTop: "2px solid var(--forest)",
                  }}
                >
                  Total
                </td>
                <td
                  style={{
                    textAlign: "right",
                    fontWeight: 700,
                    borderTop: "2px solid var(--forest)",
                  }}
                >
                  {formatCents(invoice.totalCents)}
                </td>
              </tr>
            </tbody>
          </table>

          {!paid && (
            <div
              style={{
                background: "var(--bone)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                padding: "16px 20px",
                margin: "24px 0 0",
              }}
            >
              <p
                style={{
                  margin: "0 0 8px",
                  fontSize: "var(--text-xs)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--ink-muted)",
                }}
              >
                Payment instructions
              </p>
              <p style={{ margin: 0, fontSize: "var(--text-sm)", lineHeight: 1.7, whiteSpace: "pre-line" }}>
                {from.paymentInstructions}
              </p>
            </div>
          )}

          <p style={{ margin: "24px 0 0", textAlign: "center" }}>
            <a
              href={`/i/${params.token}/pdf`}
              style={{ color: "var(--color-accent)", fontSize: "var(--text-sm)" }}
            >
              Download PDF
            </a>
          </p>
        </div>
      </div>
      <p
        style={{
          textAlign: "center",
          fontSize: "var(--text-xs)",
          color: "var(--ink-muted)",
          marginTop: 16,
        }}
      >
        Questions? Reply to the invoice email or write {from.email}.
      </p>
    </main>
  );
}
