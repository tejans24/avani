import Link from "next/link";
import { db } from "@/lib/db";
import { todayUtc, formatDateLong } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { suggestionsForTransactions } from "@/lib/match-data";
import { computeYearEstimate } from "@/lib/tax-data";
import { windowOpen } from "@/lib/compliance";

type NeedsYouItem = { label: string; detail?: string; href: string };

/**
 * The dashboard's one consolidated ask-list. Empty is the success state —
 * the whole platform is designed to keep this list at zero.
 */
export async function NeedsYouList() {
  const now = new Date();
  const today = todayUtc();

  const [suggestions, drafts, overdue, unreviewed, deadlines, estimate] =
    await Promise.all([
      suggestionsForTransactions(),
      db.invoice.findMany({
        where: { status: "DRAFT" },
        include: { client: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      }),
      db.invoice.count({ where: { status: "SENT", dueDate: { lt: today } } }),
      db.transaction.count({ where: { status: "UNREVIEWED" } }),
      db.complianceDeadline.findMany({ where: { enabled: true } }),
      computeYearEstimate(now).catch(() => null),
    ]);

  const items: NeedsYouItem[] = [];

  if (suggestions.size > 0) {
    items.push({
      label: `${suggestions.size} deposit${suggestions.size === 1 ? " looks" : "s look"} like invoice payments`,
      detail: "Confirm to mark them paid",
      href: "/transactions",
    });
  }
  for (const d of drafts.slice(0, 3)) {
    items.push({
      label: `Draft ${d.number} for ${d.client.name} — ${formatCents(d.totalCents)}`,
      detail: "Review and send",
      href: `/invoices/${d.id}`,
    });
  }
  if (drafts.length > 3) {
    items.push({
      label: `${drafts.length - 3} more draft${drafts.length - 3 === 1 ? "" : "s"} awaiting review`,
      href: "/invoices?status=draft",
    });
  }
  if (overdue > 0) {
    items.push({
      label: `${overdue} invoice${overdue === 1 ? " is" : "s are"} overdue`,
      detail: "Consider a reminder",
      href: "/invoices?status=overdue",
    });
  }
  if (unreviewed > 0) {
    items.push({
      label: `${unreviewed} transaction${unreviewed === 1 ? "" : "s"} to review`,
      detail: "Categorize for a clean P&L",
      href: "/transactions?status=unreviewed",
    });
  }
  const openWindows = deadlines.filter((d) => windowOpen(d, now));
  for (const d of openWindows.slice(0, 2)) {
    items.push({
      label: `${d.title} due ${formatDateLong(d.dueDate)}`,
      detail: "Preparation window open",
      href: "/reports/taxes",
    });
  }
  const nextDue = estimate?.estimate.nextDue;
  if (nextDue && nextDue.remainingCents > 0) {
    const days = Math.round(
      (new Date(nextDue.quarter.dueDateIso).getTime() - today.getTime()) / 86400_000
    );
    if (days >= 0 && days <= 21) {
      items.push({
        label: `Q${nextDue.quarter.quarter} estimated tax due ${formatDateLong(nextDue.quarter.dueDateIso)} — ~${formatCents(nextDue.remainingCents)}`,
        detail: "Record the payment once sent",
        href: "/reports/taxes",
      });
    }
  }

  return (
    <div
      data-testid="needs-you"
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
        marginBottom: 28,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "14px 20px 12px",
          borderBottom: items.length > 0 ? "1px solid var(--border-subtle)" : "none",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-xs)",
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
          }}
        >
          Needs you
        </span>
        {items.length === 0 && (
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
              color: "var(--text-muted)",
            }}
          >
            Nothing — all caught up. 🌤
          </span>
        )}
      </div>
      {items.map((item, i) => (
        <Link
          key={`${item.href}:${item.label}`}
          href={item.href}
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            padding: "11px 20px",
            borderBottom: i < items.length - 1 ? "1px solid var(--border-subtle)" : "none",
            textDecoration: "none",
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-sm)",
            transition: "background var(--dur-fast) var(--ease-standard)",
          }}
          className="needs-you-row"
        >
          <span
            aria-hidden="true"
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "var(--clay)",
              flexShrink: 0,
              alignSelf: "center",
            }}
          />
          <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
            {item.label}
          </span>
          {item.detail && (
            <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>
              {item.detail}
            </span>
          )}
          <span style={{ marginLeft: "auto", color: "var(--color-accent)" }}>→</span>
        </Link>
      ))}
    </div>
  );
}
