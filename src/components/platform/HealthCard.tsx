import Link from "next/link";
import { db } from "@/lib/db";
import { Badge } from "@/components/platform/ds";

const TICK_STALE_MS = 2 * 3600_000;

/**
 * "Is my machine running?" — one glance. Green and boring on a good day.
 * Red rows link straight to the place where the fix lives.
 */
export async function HealthCard() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600_000);

  const [settings, failedRuns, stuckEvents, lastSyncFail, deliveryFails] =
    await Promise.all([
      db.companySettings.findUnique({
        where: { id: 1 },
        select: { lastTickAt: true },
      }),
      db.handlerRun.count({ where: { status: "FAILED", ranAt: { gte: weekAgo } } }),
      db.domainEvent.count({
        where: { processedAt: null, createdAt: { lt: new Date(now.getTime() - 3600_000) } },
      }),
      db.domainEvent.findFirst({
        where: { type: "sync.failed", createdAt: { gte: weekAgo } },
        orderBy: { createdAt: "desc" },
      }),
      db.notification.count({
        where: {
          createdAt: { gte: weekAgo },
          OR: [
            { delivery: { path: ["email"], string_starts_with: "FAILED" } },
            { delivery: { path: ["sms"], string_starts_with: "FAILED" } },
          ],
        },
      }),
    ]);

  const tickStale =
    !settings?.lastTickAt ||
    now.getTime() - settings.lastTickAt.getTime() > TICK_STALE_MS;
  const issues =
    (tickStale ? 1 : 0) +
    (failedRuns > 0 ? 1 : 0) +
    (stuckEvents > 0 ? 1 : 0) +
    (lastSyncFail ? 1 : 0) +
    (deliveryFails > 0 ? 1 : 0);

  const rows: { label: string; ok: boolean; detail: string; href?: string }[] = [
    {
      label: "Automation clock",
      ok: !tickStale,
      detail: settings?.lastTickAt
        ? `last tick ${Math.round((now.getTime() - settings.lastTickAt.getTime()) / 60000)}m ago`
        : "never ticked — check the Vercel cron",
    },
    {
      label: "Reactions",
      ok: failedRuns === 0,
      detail: failedRuns === 0 ? "all runs OK (7d)" : `${failedRuns} failed run${failedRuns === 1 ? "" : "s"} (7d)`,
      href: failedRuns > 0 ? "/activity?view=failures" : undefined,
    },
    {
      label: "Event queue",
      ok: stuckEvents === 0,
      detail: stuckEvents === 0 ? "nothing stuck" : `${stuckEvents} event${stuckEvents === 1 ? "" : "s"} unprocessed > 1h`,
      href: stuckEvents > 0 ? "/activity?view=failures" : undefined,
    },
    {
      label: "Bank sync",
      ok: !lastSyncFail,
      detail: lastSyncFail ? "last Mercury sync failed" : "no sync failures (7d)",
      href: lastSyncFail ? "/accounts" : undefined,
    },
    {
      label: "Notifications",
      ok: deliveryFails === 0,
      detail:
        deliveryFails === 0
          ? "email/SMS delivering"
          : `${deliveryFails} delivery failure${deliveryFails === 1 ? "" : "s"} (7d)`,
      href: deliveryFails > 0 ? "/activity?view=failures" : undefined,
    },
  ];

  return (
    <div
      data-testid="health-card"
      style={{
        background: "var(--color-surface)",
        border: `1px solid ${issues > 0 ? "#E5C2B9" : "var(--border-subtle)"}`,
        borderRadius: "var(--radius-lg)",
        padding: "18px 20px",
        marginBottom: 28,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
          fontFamily: "var(--font-sans)",
        }}
      >
        <span
          style={{
            fontSize: "var(--text-xs)",
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
          }}
        >
          System health
        </span>
        <Badge tone={issues > 0 ? "critical" : "positive"}>
          {issues > 0 ? `${issues} issue${issues === 1 ? "" : "s"}` : "All systems go"}
        </Badge>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 10,
        }}
      >
        {rows.map((r) => {
          const inner = (
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                fontFamily: "var(--font-sans)",
                fontSize: "var(--text-sm)",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: r.ok ? "var(--positive)" : "var(--critical)",
                  flexShrink: 0,
                  alignSelf: "center",
                }}
              />
              <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                {r.label}
              </span>
              <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>
                {r.detail}
              </span>
            </div>
          );
          return r.href ? (
            <Link key={r.label} href={r.href} style={{ textDecoration: "none" }}>
              {inner}
            </Link>
          ) : (
            <div key={r.label}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}
