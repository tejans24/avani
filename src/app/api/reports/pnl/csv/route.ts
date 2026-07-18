import { requireAuth } from "@/lib/auth";
import { getPnlPageData } from "@/lib/pnl-data";
import { todayUtc } from "@/lib/dates";
import type { PnlRow } from "@/lib/pnl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Accountant CSV: monthly grid + tax-line column. */
export async function GET(req: Request) {
  try {
    await requireAuth();
  } catch {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year")) || todayUtc().getUTCFullYear();
  const { pnl, reconciliation } = await getPnlPageData({ year, granularity: "MONTH" });

  const lines: string[] = [];
  const header = [
    "Section",
    "Category",
    "1120-S line",
    ...pnl.periods.map((p) => p.label),
    "Total",
  ];
  lines.push(header.join(","));

  const pushRow = (section: string, row: PnlRow, negate: boolean) => {
    lines.push(
      [
        section,
        csvEscape(row.name),
        row.taxLine === "NONE" ? "" : row.taxLine,
        ...row.cells.map((c) => centsToDollars(negate ? -c.cents : c.cents)),
        centsToDollars(negate ? -row.totalCents : row.totalCents),
      ].join(",")
    );
  };

  for (const r of pnl.income) pushRow("Income", r, false);
  for (const r of pnl.expenses) pushRow("Expenses", r, true);
  lines.push(
    [
      "Net profit",
      "",
      "",
      ...pnl.netProfitCells.map((c) => centsToDollars(c.cents)),
      centsToDollars(pnl.netProfitCents),
    ].join(",")
  );
  if (pnl.uncategorized) pushRow("Uncategorized", pnl.uncategorized, false);
  for (const r of pnl.belowLine) pushRow("Below the line", r, false);
  lines.push("");
  lines.push(
    `Reconciliation,Invoiced & paid,,${centsToDollars(reconciliation.invoicedPaidCents)}`
  );
  lines.push(
    `Reconciliation,Gross-receipts deposits,,${centsToDollars(reconciliation.grossReceiptsCents)}`
  );

  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pnl-${year}.csv"`,
    },
  });
}
