import Link from "next/link";
import { db } from "@/lib/db";
import { Badge } from "@/components/platform/ds";
import { formatCents } from "@/lib/money";

export const metadata = { title: "Activity — Avani" };
export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, { label: string; tone: string }> = {
  "invoice.sent": { label: "Invoice sent", tone: "brand" },
  "invoice.paid": { label: "Paid", tone: "positive" },
  "invoice.voided": { label: "Voided", tone: "caution" },
  "invoice.overdue": { label: "Overdue", tone: "critical" },
  "invoice.draft_prepared": { label: "Draft prepared", tone: "brand" },
  "invoice.reminder_sent": { label: "Reminder sent", tone: "neutral" },
  "transactions.imported": { label: "Imported", tone: "neutral" },
  "transaction.match_suggested": { label: "Match suggested", tone: "brand" },
  "transaction.matched": { label: "Matched", tone: "positive" },
  "payment.missing": { label: "Payment missing", tone: "critical" },
  "taxes.quarter_approaching": { label: "Tax deadline", tone: "critical" },
  "compliance.window_open": { label: "Compliance", tone: "caution" },
  "sync.failed": { label: "Sync failed", tone: "critical" },
};

function summarize(type: string, p: Record<string, unknown>): string {
  switch (type) {
    case "invoice.sent":
      return `${p.number} to ${p.clientName} — ${formatCents(Number(p.totalCents))}`;
    case "invoice.paid":
      return `${p.number} — ${formatCents(Number(p.totalCents))} from ${p.clientName} (${p.via})`;
    case "invoice.voided":
      return String(p.number);
    case "invoice.overdue":
      return `${p.number} — ${p.clientName}, ${formatCents(Number(p.totalCents))}, ${p.daysPast} days past due`;
    case "invoice.draft_prepared":
      return `${p.number} for ${p.clientName}`;
    case "invoice.reminder_sent":
      return `${p.number} reminder to ${p.to}`;
    case "transactions.imported":
      return `${p.imported} into ${p.accountName} (${p.skipped} duplicates skipped)`;
    case "transaction.match_suggested":
      return `${formatCents(Number(p.amountCents))} deposit ↔ ${p.invoiceNumber} (${p.clientName})`;
    case "transaction.matched":
      return `deposit confirmed as ${p.invoiceNumber}`;
    case "payment.missing":
      return `${p.number} — ${p.clientName}, ${formatCents(Number(p.totalCents))}`;
    case "taxes.quarter_approaching":
      return `Q${p.quarter} due ${p.dueDateIso} — ~${formatCents(Number(p.estimatedRemainingCents))} remaining`;
    case "compliance.window_open":
      return `${p.title} (due ${p.dueDateIso})`;
    case "sync.failed":
      return `${p.source}: ${p.error}`;
    default:
      return JSON.stringify(p).slice(0, 120);
  }
}

function eventHref(e: { entityType: string | null; entityId: string | null }): string | null {
  if (e.entityType === "invoice" && e.entityId) return `/invoices/${e.entityId}`;
  if (e.entityType === "transaction") return "/transactions";
  if (e.entityType === "account" && e.entityId) return `/transactions?account=${e.entityId}`;
  if (e.entityType === "deadline") return "/reports/taxes";
  return null;
}

const timeFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export default async function ActivityPage() {
  const events = await db.domainEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Visiting the feed clears the bell.
  await db.notification.updateMany({
    where: { readAt: null },
    data: { readAt: new Date() },
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Activity</h1>
          <p className="sub">Everything the system did or noticed, newest first.</p>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="empty-state">Nothing yet — activity appears as invoices move and money flows.</div>
      ) : (
        <div
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
          }}
        >
          {events.map((e) => {
            const meta = TYPE_LABEL[e.type] ?? { label: e.type, tone: "neutral" };
            const href = eventHref(e);
            const body = (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--border-subtle)",
                  fontFamily: "var(--font-sans)",
                  fontSize: "var(--text-sm)",
                }}
              >
                <Badge tone={meta.tone}>{meta.label}</Badge>
                <span style={{ flex: 1, color: "var(--text-primary)" }}>
                  {summarize(e.type, e.payload as Record<string, unknown>)}
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)", whiteSpace: "nowrap" }}>
                  {timeFmt.format(e.createdAt)}
                </span>
              </div>
            );
            return href ? (
              <Link key={e.id} href={href} style={{ textDecoration: "none", display: "block" }}>
                {body}
              </Link>
            ) : (
              <div key={e.id}>{body}</div>
            );
          })}
        </div>
      )}
    </>
  );
}
