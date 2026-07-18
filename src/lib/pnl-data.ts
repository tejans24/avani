import { db } from "@/lib/db";
import {
  aggregatePnl,
  type PnlData,
  type PnlGranularity,
} from "@/lib/pnl";

export type PnlPageData = {
  pnl: PnlData;
  /**
   * Revenue double-count guard: P&L revenue comes exclusively from
   * income-categorized transactions. Invoices are receivables tracking.
   * This reconciliation surfaces drift between the two views.
   */
  reconciliation: {
    invoicedPaidCents: number;
    grossReceiptsCents: number;
  };
};

export async function getPnlPageData(opts: {
  year: number;
  granularity: PnlGranularity;
}): Promise<PnlPageData> {
  const yearStart = new Date(Date.UTC(opts.year, 0, 1));
  const yearEnd = new Date(Date.UTC(opts.year + 1, 0, 1));

  const [txns, categories, paidAgg] = await Promise.all([
    db.transaction.findMany({
      where: { postedAt: { gte: yearStart, lt: yearEnd } },
      select: {
        postedAt: true,
        amountCents: true,
        categoryId: true,
        status: true,
      },
    }),
    db.category.findMany({
      select: {
        id: true,
        name: true,
        kind: true,
        taxLine: true,
        deductiblePct: true,
        sortOrder: true,
      },
    }),
    db.invoice.aggregate({
      where: { status: "PAID", paidAt: { gte: yearStart, lt: yearEnd } },
      _sum: { totalCents: true },
    }),
  ]);

  const pnl = aggregatePnl(txns, categories, opts);

  const incomeCategoryIds = new Set(
    categories.filter((c) => c.kind === "INCOME").map((c) => c.id)
  );
  const grossReceiptsCents = txns
    .filter(
      (t) =>
        t.status !== "EXCLUDED" &&
        t.categoryId !== null &&
        incomeCategoryIds.has(t.categoryId)
    )
    .reduce((sum, t) => sum + t.amountCents, 0);

  return {
    pnl,
    reconciliation: {
      invoicedPaidCents: paidAgg._sum.totalCents ?? 0,
      grossReceiptsCents,
    },
  };
}
