"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDeadlineEnabled } from "@/actions/tax";
import type { DeadlineView, PackageReadiness } from "@/lib/tax-data";
import { formatCents } from "@/lib/money";
import { formatDateLong } from "@/lib/dates";
import { Badge, Button, Switch } from "@/components/platform/ds";

function dueBadge(d: DeadlineView) {
  if (d.daysUntil < 0) {
    return <Badge tone="critical">{-d.daysUntil} days past due</Badge>;
  }
  if (d.windowOpen) {
    return (
      <Badge tone="critical">
        {d.daysUntil === 0 ? "Due today" : `${d.daysUntil} days`}
      </Badge>
    );
  }
  return <Badge tone="neutral">{d.daysUntil} days</Badge>;
}

/**
 * The accountant package for a Form 1120-S deadline covers the PRIOR tax
 * year (the return due in March files last year's books).
 */
function packageYear(d: DeadlineView): number {
  return parseInt(d.dueDateIso.slice(0, 4), 10) - 1;
}

function PackageBlock({
  deadline,
  readiness,
}: {
  deadline: DeadlineView;
  readiness: PackageReadiness;
}) {
  const year = packageYear(deadline);
  const blockers: React.ReactNode[] = [];
  if (readiness.uncategorizedCount > 0) {
    blockers.push(
      <Link key="uncat" href="/transactions?category=none">
        {readiness.uncategorizedCount} uncategorized transaction
        {readiness.uncategorizedCount === 1 ? "" : "s"}
      </Link>
    );
  }
  if (readiness.unreviewedCount > 0) {
    blockers.push(
      <Link key="unrev" href="/transactions?status=unreviewed">
        {readiness.unreviewedCount} unreviewed
      </Link>
    );
  }

  return (
    <div
      data-testid="package-block"
      style={{
        marginTop: 10,
        padding: "12px 14px",
        background: "var(--color-surface-sunken)",
        borderRadius: "var(--radius-md)",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-sm)",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8, color: "var(--text-primary)" }}>
        Accountant package — {year}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <Button
          href={`/api/reports/pnl/csv?year=${year}`}
          variant="secondary"
          size="sm"
        >
          P&amp;L CSV ({year})
        </Button>
        <Button
          href={`/api/reports/pnl/pdf?year=${year}`}
          variant="secondary"
          size="sm"
        >
          P&amp;L PDF ({year})
        </Button>
      </div>
      {blockers.length > 0 ? (
        <div style={{ color: "var(--caution)", marginBottom: 6 }}>
          Blockers:{" "}
          {blockers.map((b, i) => (
            <span key={i}>
              {i > 0 && " · "}
              {b}
            </span>
          ))}
        </div>
      ) : (
        <div style={{ color: "var(--text-muted)", marginBottom: 6 }}>
          No blockers — all transactions categorized and reviewed.
        </div>
      )}
      <div style={{ color: "var(--text-muted)" }}>
        Officer compensation {formatCents(readiness.officerCompCents)} vs distributions{" "}
        {formatCents(readiness.distributionsCents)}
      </div>
    </div>
  );
}

/** Compliance calendar: each deadline with its window state and enable toggle. */
export function ComplianceList({
  deadlines,
  readiness,
}: {
  deadlines: DeadlineView[];
  readiness: PackageReadiness;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Optimistic checked states so the switch flips immediately.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const toggle = (id: string, next: boolean) => {
    setOverrides((o) => ({ ...o, [id]: next }));
    setError(null);
    startTransition(async () => {
      const result = await setDeadlineEnabled(id, next);
      if (result.ok === false) {
        setOverrides((o) => ({ ...o, [id]: !next }));
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="form-card">
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-lg)",
          margin: "0 0 16px",
          color: "var(--text-primary)",
        }}
      >
        Compliance calendar
      </h2>

      {deadlines.length === 0 ? (
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-sm)",
            color: "var(--text-muted)",
            margin: 0,
          }}
        >
          No deadlines yet — run the database seed to load the federal S-corp calendar.
        </p>
      ) : (
        <div>
          {deadlines.map((d) => {
            const enabled = overrides[d.id] ?? d.enabled;
            return (
              <div
                key={d.id}
                data-testid={`deadline-${d.key}`}
                style={{
                  padding: "14px 0",
                  borderBottom: "1px solid var(--border-subtle)",
                  opacity: enabled ? 1 : 0.55,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ flex: 1, fontFamily: "var(--font-sans)" }}>
                    <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-primary)" }}>
                      {d.title}
                    </div>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 2 }}>
                      Due {formatDateLong(d.dueDateIso)}
                      {d.notes ? ` — ${d.notes}` : ""}
                    </div>
                  </div>
                  {enabled && dueBadge(d)}
                  <Switch
                    checked={enabled}
                    data-testid={`deadline-toggle-${d.key}`}
                    disabled={pending}
                    onChange={(next: boolean) => toggle(d.id, next)}
                  />
                </div>
                {enabled && d.windowOpen && d.key.startsWith("form-1120s") && (
                  <PackageBlock deadline={d} readiness={readiness} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <p
          role="alert"
          style={{
            marginTop: 12,
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-sm)",
            color: "var(--critical)",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
