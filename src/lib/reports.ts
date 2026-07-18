import { db } from "@/lib/db";

/**
 * Server-side aggregation queries for the Reports page.
 * All monetary values are integer cents (see src/lib/money.ts).
 */

export type ReportsData = {
  outstandingCents: number; // SENT invoices total
  overdueCents: number; // SENT past due
  collectedCents: number; // PAID total (all time)
  collectedYtdCents: number; // PAID with paidAt in current calendar year
  avgDaysToPayment: number | null; // avg(paidAt - issueDate) in days over PAID
  revenueByMonth: { month: string; cents: number }[]; // last 12 months from PAID by paidAt
  topClients: { name: string; cents: number }[]; // top 5 by PAID revenue
};

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const MS_PER_DAY = 86_400_000;

/** "Jan 26"-style label from a UTC year/month pair. */
function monthLabel(year: number, monthIndex: number): string {
  return `${SHORT_MONTHS[monthIndex]} ${String(year % 100).padStart(2, "0")}`;
}

export async function getReportsData(now: Date = new Date()): Promise<ReportsData> {
  // Date-only comparison in UTC, matching deriveDisplayStatus (due strictly before today).
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  const [outstandingAgg, overdueAgg, paidInvoices] = await Promise.all([
    db.invoice.aggregate({
      _sum: { totalCents: true },
      where: { status: "SENT" },
    }),
    db.invoice.aggregate({
      _sum: { totalCents: true },
      where: { status: "SENT", dueDate: { lt: todayUtc } },
    }),
    db.invoice.findMany({
      where: { status: "PAID" },
      select: {
        totalCents: true,
        issueDate: true,
        paidAt: true,
        client: { select: { name: true } },
      },
    }),
  ]);

  const outstandingCents = outstandingAgg._sum.totalCents ?? 0;
  const overdueCents = overdueAgg._sum.totalCents ?? 0;

  // --- PAID aggregations (done in JS: the row count here is small) ---
  let collectedCents = 0;
  let collectedYtdCents = 0;
  let daysToPaymentTotal = 0;
  let daysToPaymentCount = 0;
  const byClient = new Map<string, number>();

  // Last 12 calendar months (UTC), oldest first, pre-filled with 0.
  const monthBuckets = new Map<string, number>(); // "YYYY-MM" -> cents
  const monthOrder: { key: string; year: number; monthIndex: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    monthBuckets.set(key, 0);
    monthOrder.push({ key, year: d.getUTCFullYear(), monthIndex: d.getUTCMonth() });
  }

  for (const inv of paidInvoices) {
    collectedCents += inv.totalCents;
    byClient.set(inv.client.name, (byClient.get(inv.client.name) ?? 0) + inv.totalCents);

    if (inv.paidAt) {
      if (inv.paidAt.getUTCFullYear() === now.getUTCFullYear()) {
        collectedYtdCents += inv.totalCents;
      }
      const key = `${inv.paidAt.getUTCFullYear()}-${inv.paidAt.getUTCMonth()}`;
      if (monthBuckets.has(key)) {
        monthBuckets.set(key, (monthBuckets.get(key) ?? 0) + inv.totalCents);
      }
      daysToPaymentTotal += (inv.paidAt.getTime() - inv.issueDate.getTime()) / MS_PER_DAY;
      daysToPaymentCount += 1;
    }
  }

  const avgDaysToPayment =
    daysToPaymentCount > 0
      ? Math.round((daysToPaymentTotal / daysToPaymentCount) * 10) / 10
      : null;

  const revenueByMonth = monthOrder.map(({ key, year, monthIndex }) => ({
    month: monthLabel(year, monthIndex),
    cents: monthBuckets.get(key) ?? 0,
  }));

  const topClients = [...byClient.entries()]
    .map(([name, cents]) => ({ name, cents }))
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 5);

  return {
    outstandingCents,
    overdueCents,
    collectedCents,
    collectedYtdCents,
    avgDaysToPayment,
    revenueByMonth,
    topClients,
  };
}
