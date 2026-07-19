import { Card } from "@/ds/components/core/Card";
import { formatCents } from "@/lib/money";
import { getReportsData } from "@/lib/reports";
import { StatTile } from "@/components/platform/StatTile";
import RevenueByMonthChart from "@/components/platform/reports/RevenueByMonthChart";
import TopClientsChart from "@/components/platform/reports/TopClientsChart";
import { ReportsTabs } from "@/components/platform/ReportsTabs";

export const metadata = { title: "Reports — Avani" };
export const dynamic = "force-dynamic";

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
          <p className="sub">Revenue and collection performance.</p>
        </div>
      </div>

      <ReportsTabs active="/reports" />

      {!hasData ? (
        <div className="empty-state">No invoice data yet.</div>
      ) : (
        <>
          <div className="stat-row">
            <StatTile
              label="Outstanding"
              value={formatCents(data.outstandingCents)}
              sublabel="Sent, awaiting payment"
            />
            <StatTile
              label="Overdue"
              value={formatCents(data.overdueCents)}
              sublabel="Sent, past due date"
              tone={data.overdueCents > 0 ? "critical" : "default"}
            />
            <StatTile
              label="Collected YTD"
              value={formatCents(data.collectedYtdCents)}
              sublabel={`Paid in ${year}`}
              tone="positive"
            />
            <StatTile
              label="Avg days to payment"
              value={
                data.avgDaysToPayment === null
                  ? "—"
                  : String(Math.round(data.avgDaysToPayment))
              }
              sublabel="Issue date to paid"
            />
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
