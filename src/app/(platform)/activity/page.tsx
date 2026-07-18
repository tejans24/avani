import Link from "next/link";
import { db } from "@/lib/db";
import { Badge } from "@/components/platform/ds";
import { formatCents } from "@/lib/money";
import { RetryEventButton } from "@/components/platform/notifications/RetryEventButton";

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

const MAX_ATTEMPTS = 5;

async function FailuresView() {
  const [failedRuns, deadLetters, deliveryFails] = await Promise.all([
    db.handlerRun.findMany({
      where: { status: "FAILED" },
      orderBy: { ranAt: "desc" },
      take: 50,
      include: { event: true },
    }),
    db.domainEvent.findMany({
      where: { processedAt: null, attempts: { gte: MAX_ATTEMPTS } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.notification.findMany({
      where: {
        OR: [
          { delivery: { path: ["email"], string_starts_with: "FAILED" } },
          { delivery: { path: ["sms"], string_starts_with: "FAILED" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  if (failedRuns.length + deadLetters.length + deliveryFails.length === 0) {
    return (
      <div className="empty-state" data-testid="no-failures">
        No failures — every automation run and delivery succeeded. 🎉
      </div>
    );
  }

  const box = {
    background: "var(--color-surface)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-lg)",
    overflow: "hidden" as const,
    marginBottom: 20,
  };
  const rowStyle = {
    display: "flex",
    alignItems: "center" as const,
    gap: 12,
    padding: "12px 16px",
    borderBottom: "1px solid var(--border-subtle)",
    fontFamily: "var(--font-sans)",
    fontSize: "var(--text-sm)",
  };

  return (
    <>
      {deadLetters.length > 0 && (
        <div style={box} data-testid="dead-letters">
          <div style={{ ...rowStyle, background: "#F2DCD7", fontWeight: 600 }}>
            Needs manual intervention — retries exhausted
          </div>
          {deadLetters.map((e) => (
            <div key={e.id} style={rowStyle}>
              <Badge tone="critical">{e.type}</Badge>
              <span style={{ flex: 1, color: "var(--text-secondary)" }}>
                {e.attempts} attempts · created {timeFmt.format(e.createdAt)}
              </span>
              <RetryEventButton eventId={e.id} />
            </div>
          ))}
        </div>
      )}

      {failedRuns.length > 0 && (
        <div style={box} data-testid="failed-runs">
          <div style={{ ...rowStyle, fontWeight: 600 }}>Failed reaction runs</div>
          {failedRuns.map((r) => (
            <div key={r.id} style={rowStyle}>
              <Badge tone="critical">{r.handler}</Badge>
              <span style={{ flex: 2, color: "var(--text-primary)" }}>
                on <code>{r.event.type}</code>
                <span
                  style={{
                    display: "block",
                    color: "var(--critical)",
                    fontSize: "var(--text-xs)",
                    marginTop: 2,
                  }}
                >
                  {r.error?.slice(0, 200)}
                </span>
              </span>
              <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>
                {timeFmt.format(r.ranAt)}
              </span>
              <RetryEventButton eventId={r.eventId} />
            </div>
          ))}
        </div>
      )}

      {deliveryFails.length > 0 && (
        <div style={box} data-testid="delivery-failures">
          <div style={{ ...rowStyle, fontWeight: 600 }}>Delivery failures</div>
          {deliveryFails.map((n) => (
            <div key={n.id} style={rowStyle}>
              <Badge tone="caution">{n.tier}</Badge>
              <span style={{ flex: 2 }}>
                {n.title}
                <span
                  style={{
                    display: "block",
                    color: "var(--critical)",
                    fontSize: "var(--text-xs)",
                    marginTop: 2,
                  }}
                >
                  {JSON.stringify(n.delivery)}
                </span>
              </span>
              <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>
                {timeFmt.format(n.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: { view?: string };
}) {
  const view = searchParams.view === "failures" ? "failures" : "all";
  const events = await db.domainEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Activity</h1>
          <p className="sub">Everything the system did or noticed, newest first.</p>
        </div>
      </div>

      <div className="filter-tabs">
        <Link href="/activity" data-active={view === "all" || undefined}>
          All activity
        </Link>
        <Link
          href="/activity?view=failures"
          data-active={view === "failures" || undefined}
        >
          Failures
        </Link>
      </div>

      {view === "failures" ? (
        <FailuresView />
      ) : null}
      {view === "failures" ? null : (
        <>

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
      )}
    </>
  );
}
