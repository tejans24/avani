/**
 * Pure P&L aggregation over categorized bank transactions.
 *
 * Conventions:
 * - Money is integer cents; transaction amounts are signed (+ money in,
 *   - money out). Row cells and totals keep the stored signs — expense rows
 *   therefore carry negative sums, and the UI is expected to negate them for
 *   display. Net profit is simply income + expenses, so the signs work out.
 * - All date bucketing uses the transaction's postedAt UTC calendar fields.
 * - EXCLUDED transactions are omitted everywhere; UNREVIEWED and REVIEWED
 *   both count.
 */

import { dateToIso } from "@/lib/dates";

export type PnlGranularity = "MONTH" | "QUARTER" | "YTD";

export type TxnForPnl = {
  postedAt: Date;
  amountCents: number;
  categoryId: string | null;
  status: string;
};

export type CategoryLike = {
  id: string;
  name: string;
  kind: string;
  taxLine: string;
  deductiblePct: number;
  sortOrder: number;
};

export type PnlCell = { periodKey: string; cents: number };

export type PnlRow = {
  categoryId: string | null;
  name: string;
  kind: string;
  taxLine: string;
  cells: PnlCell[];
  totalCents: number;
};

export type PnlData = {
  periods: { key: string; label: string; startIso: string; endIso: string }[];
  income: PnlRow[];
  expenses: PnlRow[];
  /** OWNER and TRANSFER category rows — shown below the net-profit line. */
  belowLine: PnlRow[];
  uncategorized: PnlRow | null;
  /** income + expenses per period (expenses are negative, so this is a plain sum). */
  netProfitCells: PnlCell[];
  netProfitCents: number;
};

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function buildPeriods(
  year: number,
  granularity: PnlGranularity
): PnlData["periods"] {
  if (granularity === "MONTH") {
    return MONTH_LABELS.map((label, m) => ({
      key: `${year}-${String(m + 1).padStart(2, "0")}`,
      label,
      startIso: dateToIso(new Date(Date.UTC(year, m, 1))),
      endIso: dateToIso(new Date(Date.UTC(year, m + 1, 0))),
    }));
  }
  if (granularity === "QUARTER") {
    return [0, 1, 2, 3].map((q) => ({
      key: `${year}-Q${q + 1}`,
      label: `Q${q + 1}`,
      startIso: dateToIso(new Date(Date.UTC(year, q * 3, 1))),
      endIso: dateToIso(new Date(Date.UTC(year, q * 3 + 3, 0))),
    }));
  }
  return [
    {
      key: String(year),
      label: String(year),
      startIso: `${year}-01-01`,
      endIso: `${year}-12-31`,
    },
  ];
}

function periodKeyFor(d: Date, year: number, granularity: PnlGranularity): string {
  const month = d.getUTCMonth(); // 0-based
  if (granularity === "MONTH") return `${year}-${String(month + 1).padStart(2, "0")}`;
  if (granularity === "QUARTER") return `${year}-Q${Math.floor(month / 3) + 1}`;
  return String(year);
}

/** Transactions that count for reporting: in the given year and not EXCLUDED. */
function reportableTxns(txns: TxnForPnl[], year: number): TxnForPnl[] {
  return txns.filter(
    (t) => t.status !== "EXCLUDED" && t.postedAt.getUTCFullYear() === year
  );
}

/**
 * Aggregate transactions into a P&L grid for one calendar year.
 *
 * Rows are grouped by category kind (INCOME above the line, EXPENSE above the
 * line, OWNER/TRANSFER below the line) and sorted by category sortOrder.
 * Categories with no activity in the year are omitted. Transactions without a
 * category land in a single "Uncategorized" row (null when there are none) and
 * do not count toward net profit.
 */
export function aggregatePnl(
  txns: TxnForPnl[],
  categories: CategoryLike[],
  opts: { year: number; granularity: PnlGranularity }
): PnlData {
  const { year, granularity } = opts;
  const periods = buildPeriods(year, granularity);

  // categoryId (or null) -> periodKey -> summed cents
  const sums = new Map<string | null, Map<string, number>>();
  for (const txn of reportableTxns(txns, year)) {
    const key = periodKeyFor(txn.postedAt, year, granularity);
    let byPeriod = sums.get(txn.categoryId);
    if (!byPeriod) {
      byPeriod = new Map();
      sums.set(txn.categoryId, byPeriod);
    }
    byPeriod.set(key, (byPeriod.get(key) ?? 0) + txn.amountCents);
  }

  const makeCells = (byPeriod: Map<string, number>): PnlCell[] =>
    periods.map((p) => ({ periodKey: p.key, cents: byPeriod.get(p.key) ?? 0 }));

  const income: PnlRow[] = [];
  const expenses: PnlRow[] = [];
  const belowLine: PnlRow[] = [];

  const sorted = [...categories].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
  );
  for (const cat of sorted) {
    const byPeriod = sums.get(cat.id);
    if (!byPeriod) continue; // zero activity -> omit
    const cells = makeCells(byPeriod);
    const row: PnlRow = {
      categoryId: cat.id,
      name: cat.name,
      kind: cat.kind,
      taxLine: cat.taxLine,
      cells,
      totalCents: cells.reduce((sum, c) => sum + c.cents, 0),
    };
    if (cat.kind === "INCOME") income.push(row);
    else if (cat.kind === "EXPENSE") expenses.push(row);
    else belowLine.push(row); // OWNER, TRANSFER
  }

  let uncategorized: PnlRow | null = null;
  const uncatSums = sums.get(null);
  if (uncatSums) {
    const cells = makeCells(uncatSums);
    uncategorized = {
      categoryId: null,
      name: "Uncategorized",
      kind: "UNCATEGORIZED",
      taxLine: "NONE",
      cells,
      totalCents: cells.reduce((sum, c) => sum + c.cents, 0),
    };
  }

  const netProfitCells: PnlCell[] = periods.map((p, i) => ({
    periodKey: p.key,
    cents: [...income, ...expenses].reduce((sum, row) => sum + row.cells[i].cents, 0),
  }));

  return {
    periods,
    income,
    expenses,
    belowLine,
    uncategorized,
    netProfitCells,
    netProfitCents: netProfitCells.reduce((sum, c) => sum + c.cents, 0),
  };
}

/**
 * Tax-view net profit in cents for a year, optionally limited to
 * postedAt <= upTo (date-only, UTC).
 *
 * Only transactions in INCOME and EXPENSE categories count (transfers, owner
 * draws, and uncategorized transactions are ignored; EXCLUDED are omitted).
 * INCOME counts in full; each EXPENSE amount is scaled by its category's
 * deductiblePct (e.g. meals at 50%: -10000 contributes -5000), rounded to the
 * nearest cent per transaction with Math.round.
 */
export function deductibleNetProfitCents(
  txns: TxnForPnl[],
  categories: CategoryLike[],
  opts: { year: number; upTo?: Date }
): number {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const upToIso = opts.upTo ? dateToIso(opts.upTo) : null;

  let total = 0;
  for (const txn of reportableTxns(txns, opts.year)) {
    if (upToIso && dateToIso(txn.postedAt) > upToIso) continue;
    const cat = txn.categoryId ? byId.get(txn.categoryId) : undefined;
    if (!cat) continue;
    if (cat.kind === "INCOME") {
      total += txn.amountCents;
    } else if (cat.kind === "EXPENSE") {
      total += Math.round((txn.amountCents * cat.deductiblePct) / 100);
    }
  }
  return total;
}
