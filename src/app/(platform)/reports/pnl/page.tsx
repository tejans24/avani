import Link from "next/link";
import { getPnlPageData } from "@/lib/pnl-data";
import type { PnlGranularity, PnlRow } from "@/lib/pnl";
import { formatCents } from "@/lib/money";
import { todayUtc } from "@/lib/dates";
import { Button } from "@/components/platform/ds";
import { ReportsTabs } from "@/components/platform/ReportsTabs";

export const metadata = { title: "P&L — Avani" };
export const dynamic = "force-dynamic";

const TAX_LINE_LABEL: Record<string, string> = {
  GROSS_RECEIPTS: "1120-S line 1a",
  OFFICER_COMPENSATION: "line 7",
  SALARIES_WAGES: "line 8",
  REPAIRS_MAINTENANCE: "line 9",
  RENTS: "line 11",
  TAXES_LICENSES: "line 12",
  INTEREST: "line 13",
  DEPRECIATION: "line 14",
  ADVERTISING: "line 16",
  EMPLOYEE_BENEFITS: "line 18",
  OTHER_DEDUCTIONS: "line 19",
  NONE: "",
};

function txnFilterHref(row: PnlRow, periodKey: string, granularity: PnlGranularity) {
  const cat = row.categoryId === null ? "none" : row.categoryId;
  // MONTH period keys are already YYYY-MM — deep-link straight into the
  // filtered transactions view; coarser granularities link without a month.
  const month = granularity === "MONTH" ? `&month=${periodKey}` : "";
  return `/transactions?category=${cat}${month}`;
}

function Row({
  row,
  granularity,
  negate,
}: {
  row: PnlRow;
  granularity: PnlGranularity;
  negate: boolean;
}) {
  return (
    <tr>
      <td>
        {row.name}
        {TAX_LINE_LABEL[row.taxLine] && (
          <span
            style={{
              display: "block",
              fontSize: "var(--text-xs)",
              color: "var(--text-muted)",
            }}
          >
            {TAX_LINE_LABEL[row.taxLine]}
          </span>
        )}
      </td>
      {row.cells.map((c) => (
        <td key={c.periodKey} className="num">
          {c.cents === 0 ? (
            <span style={{ color: "var(--text-faint)" }}>—</span>
          ) : (
            <Link href={txnFilterHref(row, c.periodKey, granularity)}>
              {formatCents(negate ? -c.cents : c.cents)}
            </Link>
          )}
        </td>
      ))}
      <td className="num" style={{ fontWeight: 600 }}>
        {formatCents(negate ? -row.totalCents : row.totalCents)}
      </td>
    </tr>
  );
}

function SectionHead({ label, cols }: { label: string; cols: number }) {
  return (
    <tr>
      <td
        colSpan={cols}
        style={{
          background: "var(--color-surface-sunken)",
          fontSize: "var(--text-xs)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--text-muted)",
          fontWeight: 600,
        }}
      >
        {label}
      </td>
    </tr>
  );
}

export default async function PnlPage({
  searchParams,
}: {
  searchParams: { year?: string; granularity?: string };
}) {
  const currentYear = todayUtc().getUTCFullYear();
  const year = Number(searchParams.year) || currentYear;
  const granularity: PnlGranularity =
    searchParams.granularity === "quarter"
      ? "QUARTER"
      : searchParams.granularity === "ytd"
        ? "YTD"
        : "MONTH";
  const gParam =
    granularity === "QUARTER" ? "quarter" : granularity === "YTD" ? "ytd" : "month";

  const { pnl, reconciliation } = await getPnlPageData({ year, granularity });
  const cols = pnl.periods.length + 2;
  const hasData =
    pnl.income.length + pnl.expenses.length + pnl.belowLine.length > 0 ||
    pnl.uncategorized !== null;

  const delta = reconciliation.invoicedPaidCents - reconciliation.grossReceiptsCents;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Profit &amp; Loss</h1>
          <p className="sub">
            Revenue and expenses from categorized transactions, mapped to Form
            1120-S lines.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            href={`/api/reports/pnl/csv?year=${year}`}
            variant="secondary"
            size="sm"
          >
            Export CSV
          </Button>
          <Button
            href={`/api/reports/pnl/pdf?year=${year}`}
            variant="secondary"
            size="sm"
          >
            Export PDF
          </Button>
        </div>
      </div>

      <ReportsTabs active="/reports/pnl" />

      <div
        style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}
      >
        <div className="filter-tabs" style={{ marginBottom: 0 }}>
          <Link href={`/reports/pnl?year=${year - 1}&granularity=${gParam}`}>
            ← {year - 1}
          </Link>
          <span
            style={{
              padding: "6px 14px",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
            }}
          >
            {year}
          </span>
          {year < currentYear && (
            <Link href={`/reports/pnl?year=${year + 1}&granularity=${gParam}`}>
              {year + 1} →
            </Link>
          )}
        </div>
        <div className="filter-tabs" style={{ marginBottom: 0 }}>
          {(["month", "quarter", "ytd"] as const).map((g) => (
            <Link
              key={g}
              href={`/reports/pnl?year=${year}&granularity=${g}`}
              data-active={g === gParam || undefined}
            >
              {g === "month" ? "Monthly" : g === "quarter" ? "Quarterly" : "YTD"}
            </Link>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div className="empty-state">
          No transactions for {year} yet — import bank or card activity to build
          your P&amp;L.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="data-table" data-testid="pnl-table">
            <thead>
              <tr>
                <th>Category</th>
                {pnl.periods.map((p) => (
                  <th key={p.key} className="num">
                    {p.label}
                  </th>
                ))}
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              <SectionHead label="Income" cols={cols} />
              {pnl.income.map((r) => (
                <Row key={r.name} row={r} granularity={granularity} negate={false} />
              ))}
              <SectionHead label="Expenses" cols={cols} />
              {pnl.expenses.map((r) => (
                <Row key={r.name} row={r} granularity={granularity} negate />
              ))}
              <tr style={{ fontWeight: 700 }}>
                <td>Net profit</td>
                {pnl.netProfitCells.map((c) => (
                  <td key={c.periodKey} className="num">
                    {formatCents(c.cents)}
                  </td>
                ))}
                <td className="num" data-testid="net-profit">
                  {formatCents(pnl.netProfitCents)}
                </td>
              </tr>
              {pnl.uncategorized && (
                <>
                  <SectionHead label="Needs categorizing" cols={cols} />
                  <Row
                    row={pnl.uncategorized}
                    granularity={granularity}
                    negate={false}
                  />
                </>
              )}
              {pnl.belowLine.length > 0 && (
                <>
                  <SectionHead
                    label="Below the line (owner & transfers)"
                    cols={cols}
                  />
                  {pnl.belowLine.map((r) => (
                    <Row key={r.name} row={r} granularity={granularity} negate={false} />
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p
        style={{
          marginTop: 16,
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-xs)",
          color: delta === 0 ? "var(--text-muted)" : "var(--caution)",
        }}
      >
        Reconciliation: invoiced &amp; paid {formatCents(reconciliation.invoicedPaidCents)} ·
        gross-receipts deposits {formatCents(reconciliation.grossReceiptsCents)}
        {delta !== 0 && ` · delta ${formatCents(delta)} — check unmatched deposits or uncategorized income`}
      </p>
    </>
  );
}
