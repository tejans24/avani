import type { ReactNode } from "react";
import { Card } from "@/ds/components/core/Card";
import { Stat } from "@/ds/components/core/Stat";
import { formatCents } from "@/lib/money";
import { getReportsData } from "@/lib/reports";
import RevenueByMonthChart from "@/components/platform/reports/RevenueByMonthChart";
import TopClientsChart from "@/components/platform/reports/TopClientsChart";
import { ReportsTabs } from "@/components/platform/ReportsTabs";

export const metadata = { title: "Reports — Avani" };
export const dynamic = "force-dynamic";

/** Tile-scale value for Stat — the ds default numeral is display-scale (too large for a 4-up row). */
function tileValue(text: string, color?: string): ReactNode {
  return (
    <span style={{ fontSize: "1.75rem", letterSpacing: "-0.01em", color }}>{text}</span>
  );
}

function sectionTitle(text: string) {
  return (
    <h2
      style={{
        fontFamily: "var(--font-display)",
        fontSize: "var(--text-lg)",
        fontWeight: "var(--weight-medium)",
        color: "var(--text-primary)",
        margin: "0 0 16px",
      }}
    >
      {text}
    </h2>
  );
}

export default async function ReportsPage() {
  const data = await getReportsData();
  const year = new Date().getUTCFullYear();

  const hasData =
    data.outstandingCents > 0 ||
    data.overdueCents > 0 ||
    data.collectedCents > 0 ||
    data.topClients.length > 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <div className="sub">Revenue and collection performance</div>
        </div>
      </div>

      <ReportsTabs active="/reports" />

      {!hasData ? (
        <div className="empty-state">No invoice data yet.</div>
      ) : (
        <>
          <div className="stat-row">
            <Card padding="md" style={{}}>
              <Stat
                value={tileValue(formatCents(data.outstandingCents))}
                label="Outstanding"
                sublabel="Sent, awaiting payment"
                style={{}}
              />
            </Card>
            <Card padding="md" style={{}}>
              <Stat
                value={tileValue(
                  formatCents(data.overdueCents),
                  data.overdueCents > 0 ? "var(--clay)" : undefined
                )}
                label="Overdue"
                sublabel="Sent, past due date"
                style={{}}
              />
            </Card>
            <Card padding="md" style={{}}>
              <Stat
                value={tileValue(formatCents(data.collectedYtdCents))}
                label="Collected YTD"
                sublabel={`Paid in ${year}`}
                style={{}}
              />
            </Card>
            <Card padding="md" style={{}}>
              <Stat
                value={tileValue(
                  data.avgDaysToPayment === null
                    ? "—"
                    : String(Math.round(data.avgDaysToPayment))
                )}
                label="Avg days to payment"
                sublabel="Issue date to paid"
                style={{}}
              />
            </Card>
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            <Card padding="lg" style={{}}>
              {sectionTitle("Revenue by month")}
              <RevenueByMonthChart data={data.revenueByMonth} />
            </Card>

            <Card padding="lg" style={{}}>
              {sectionTitle("Top clients")}
              {data.topClients.length > 0 ? (
                <TopClientsChart data={data.topClients} />
              ) : (
                <div className="empty-state">No paid invoices yet.</div>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
