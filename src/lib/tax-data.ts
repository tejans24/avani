import { db } from "@/lib/db";
import { dateToIso, todayUtc } from "@/lib/dates";
import { deductibleNetProfitCents } from "@/lib/pnl";
import { estimateTaxes, type EstimateResult } from "@/lib/tax-estimates";
import { daysUntil, windowOpen } from "@/lib/compliance";

/**
 * Server-side assembly for the /reports/taxes page (and the quarter-window
 * detector, which reuses computeYearEstimate). Everything returned is plain
 * serializable data — dates are ISO strings — so it can cross into client
 * components untouched.
 */

export type TaxSettingsView = {
  state: string;
  federalRateBps: number;
  stateRateBps: number;
  ownerSalaryAnnualCents: number;
  withholdingYtdCents: number;
  cpaFiles1120S: boolean | null;
  payrollProvider: string | null;
};

export type EstimatePaymentView = {
  id: string;
  year: number;
  quarter: number;
  jurisdiction: "FEDERAL" | "STATE";
  paidDateIso: string;
  amountCents: number;
  notes: string | null;
};

export type DeadlineView = {
  id: string;
  key: string;
  title: string;
  dueDateIso: string;
  leadDays: number;
  enabled: boolean;
  notes: string | null;
  windowOpen: boolean;
  daysUntil: number;
};

export type PackageReadiness = {
  /** Counts for the current calendar year of `now`. */
  uncategorizedCount: number;
  unreviewedCount: number;
  /** Positive display cents (expenses are stored negative). */
  officerCompCents: number;
  distributionsCents: number;
};

export type TaxPageData = {
  year: number;
  asOfIso: string;
  settings: TaxSettingsView;
  ytdNetProfitCents: number;
  estimate: EstimateResult;
  payments: EstimatePaymentView[];
  deadlines: DeadlineView[];
  readiness: PackageReadiness;
};

const DEFAULT_SETTINGS: TaxSettingsView = {
  state: "",
  federalRateBps: 2400,
  stateRateBps: 0,
  ownerSalaryAnnualCents: 0,
  withholdingYtdCents: 0,
  cpaFiles1120S: null,
  payrollProvider: null,
};

/**
 * Load settings + payments + this year's transactions and run the estimator.
 * Shared by the page and detectQuarterWindows so both see identical numbers.
 */
export async function computeYearEstimate(now: Date): Promise<{
  year: number;
  settings: TaxSettingsView;
  ytdNetProfitCents: number;
  estimate: EstimateResult;
  payments: EstimatePaymentView[];
}> {
  const year = now.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const [settingsRow, paymentRows, txns, categories] = await Promise.all([
    db.taxSettings.findUnique({ where: { id: 1 } }),
    db.quarterlyEstimatePayment.findMany({
      where: { year },
      orderBy: [{ quarter: "asc" }, { paidDate: "asc" }],
    }),
    db.transaction.findMany({
      where: { postedAt: { gte: yearStart, lt: yearEnd } },
      select: { postedAt: true, amountCents: true, categoryId: true, status: true },
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
  ]);

  const settings: TaxSettingsView = settingsRow
    ? {
        state: settingsRow.state,
        federalRateBps: settingsRow.federalRateBps,
        stateRateBps: settingsRow.stateRateBps,
        ownerSalaryAnnualCents: settingsRow.ownerSalaryAnnualCents,
        withholdingYtdCents: settingsRow.withholdingYtdCents,
        cpaFiles1120S: settingsRow.cpaFiles1120S,
        payrollProvider: settingsRow.payrollProvider,
      }
    : DEFAULT_SETTINGS;

  const ytdNetProfitCents = deductibleNetProfitCents(txns, categories, { year, upTo: now });

  const estimate = estimateTaxes({
    ytdNetProfitCents,
    asOf: now,
    year,
    federalRateBps: settings.federalRateBps,
    stateRateBps: settings.stateRateBps,
    withholdingYtdCents: settings.withholdingYtdCents,
    payments: paymentRows.map((p) => ({
      quarter: p.quarter as 1 | 2 | 3 | 4,
      jurisdiction: p.jurisdiction,
      amountCents: p.amountCents,
    })),
  });

  return {
    year,
    settings,
    ytdNetProfitCents,
    estimate,
    payments: paymentRows.map((p) => ({
      id: p.id,
      year: p.year,
      quarter: p.quarter,
      jurisdiction: p.jurisdiction,
      paidDateIso: dateToIso(p.paidDate),
      amountCents: p.amountCents,
      notes: p.notes,
    })),
  };
}

/** Everything the /reports/taxes page renders, in one typed object. */
export async function getTaxPageData(now: Date = todayUtc()): Promise<TaxPageData> {
  const year = now.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const [core, deadlineRows, uncategorizedCount, unreviewedCount, packageTxns] =
    await Promise.all([
      computeYearEstimate(now),
      db.complianceDeadline.findMany({
        orderBy: [{ enabled: "desc" }, { dueDate: "asc" }],
      }),
      db.transaction.count({
        where: {
          postedAt: { gte: yearStart, lt: yearEnd },
          categoryId: null,
          status: { not: "EXCLUDED" },
        },
      }),
      db.transaction.count({
        where: { postedAt: { gte: yearStart, lt: yearEnd }, status: "UNREVIEWED" },
      }),
      db.transaction.findMany({
        where: {
          postedAt: { gte: yearStart, lt: yearEnd },
          status: { not: "EXCLUDED" },
          categoryId: { not: null },
        },
        select: { amountCents: true, category: { select: { name: true, taxLine: true } } },
      }),
    ]);

  // Officer comp (1120-S line 7) vs owner distributions — the reasonable-comp
  // sanity line for the accountant package. Stored signs are negative
  // (money out); display as positives.
  let officerCompCents = 0;
  let distributionsCents = 0;
  for (const t of packageTxns) {
    if (t.category?.taxLine === "OFFICER_COMPENSATION") officerCompCents += -t.amountCents;
    else if (t.category?.name === "Owner Distribution") distributionsCents += -t.amountCents;
  }

  return {
    year,
    asOfIso: dateToIso(now),
    settings: core.settings,
    ytdNetProfitCents: core.ytdNetProfitCents,
    estimate: core.estimate,
    payments: core.payments,
    deadlines: deadlineRows.map((d) => ({
      id: d.id,
      key: d.key,
      title: d.title,
      dueDateIso: dateToIso(d.dueDate),
      leadDays: d.leadDays,
      enabled: d.enabled,
      notes: d.notes,
      windowOpen: windowOpen(d, now),
      daysUntil: daysUntil(d, now),
    })),
    readiness: {
      uncategorizedCount,
      unreviewedCount,
      officerCompCents,
      distributionsCents,
    },
  };
}
