import { normalizeCompany } from "@/lib/jobs/dedupe";

/**
 * Federal contract awards from USAspending.gov (public API, no key). Pure
 * parts only (unit-tested); awards-refresh.ts does the fetching and writes.
 *
 *   POST https://api.usaspending.gov/api/v2/search/spending_by_award/
 *   { filters: { award_type_codes, agencies, naics_codes, time_period },
 *     fields: [...], sort, order, limit, page }
 *   → { results: [{ "Award ID", "Recipient Name", "Award Amount", ... ,
 *                   generated_internal_id }], page_metadata: { hasNext } }
 *
 * Contracts only (types A–D), IT and research NAICS codes, actions in the
 * last AWARD_LOOKBACK_DAYS, newest first.
 */

export const AWARDS_ENDPOINT = "https://api.usaspending.gov/api/v2/search/spending_by_award/";
export const AWARD_LOOKBACK_DAYS = 90;
export const AWARD_PAGE_SIZE = 100;
export const AWARD_MAX_PAGES = 3;

/** IT services, hosting, and physical/engineering R&D (climate science work). */
export const AWARD_NAICS = ["541511", "541512", "541519", "518210", "541715"];

export type AwardQueryDef = {
  label: string;
  agencyTier: "toptier" | "subtier";
  agencyName: string;
  toptierName?: string;
  group: "climate" | "health-civic";
};

/** Seeded on first use; edit or pause them on the Awards page. */
export const DEFAULT_AWARD_QUERIES: AwardQueryDef[] = [
  { label: "EPA", agencyTier: "toptier", agencyName: "Environmental Protection Agency", group: "climate" },
  { label: "NOAA", agencyTier: "subtier", agencyName: "National Oceanic and Atmospheric Administration", toptierName: "Department of Commerce", group: "climate" },
  { label: "DOE", agencyTier: "toptier", agencyName: "Department of Energy", group: "climate" },
  { label: "USGS", agencyTier: "subtier", agencyName: "U.S. Geological Survey", toptierName: "Department of the Interior", group: "climate" },
  { label: "FEMA", agencyTier: "subtier", agencyName: "Federal Emergency Management Agency", toptierName: "Department of Homeland Security", group: "climate" },
  { label: "NASA", agencyTier: "toptier", agencyName: "National Aeronautics and Space Administration", group: "climate" },
  { label: "CMS", agencyTier: "subtier", agencyName: "Centers for Medicare and Medicaid Services", toptierName: "Department of Health and Human Services", group: "health-civic" },
  { label: "VA", agencyTier: "toptier", agencyName: "Department of Veterans Affairs", group: "health-civic" },
];

export const AWARD_FIELDS = [
  "Award ID",
  "Recipient Name",
  "Award Amount",
  "Description",
  "Start Date",
  "End Date",
  "Awarding Agency",
  "Awarding Sub Agency",
  "NAICS",
  "Place of Performance State Code",
  "generated_internal_id",
];

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function buildAwardSearchBody(q: AwardQueryDef, now: Date, page: number) {
  const start = new Date(now.getTime() - AWARD_LOOKBACK_DAYS * 86_400_000);
  return {
    filters: {
      award_type_codes: ["A", "B", "C", "D"],
      agencies: [
        q.agencyTier === "subtier"
          ? { type: "awarding", tier: "subtier", name: q.agencyName, toptier_name: q.toptierName }
          : { type: "awarding", tier: "toptier", name: q.agencyName },
      ],
      naics_codes: { require: AWARD_NAICS },
      // New awards only: without it, any old contract with a recent
      // modification matches (verified against the live API).
      time_period: [{ start_date: isoDay(start), end_date: isoDay(now), date_type: "new_awards_only" }],
    },
    fields: AWARD_FIELDS,
    sort: "Award Amount",
    order: "desc",
    limit: AWARD_PAGE_SIZE,
    page,
  };
}

export type NormalizedAward = {
  awardKey: string;
  piid: string;
  recipientName: string;
  normalizedRecipient: string;
  agency: string;
  subAgency: string | null;
  description: string | null;
  amountCents: bigint | null;
  startDate: Date | null;
  endDate: Date | null;
  naics: string | null;
  placeState: string | null;
  url: string;
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const date = (v: unknown) => {
  const s = str(v);
  return s && !Number.isNaN(Date.parse(s)) ? new Date(s.slice(0, 10) + "T00:00:00Z") : null;
};

/** "LEIDOS, INC." → "Leidos, Inc." (USAspending names are upper case). */
export function displayRecipient(name: string): string {
  if (name !== name.toUpperCase()) return name;
  const keepUpper = new Set(["LLC", "LP", "LLP", "PBC", "USA", "US", "IT", "CACI", "SAIC", "GDIT", "ICF", "RTI", "IMSG", "ERT", "STC", "SSAI", "AECOM"]);
  return name
    .toLowerCase()
    .replace(/\b[a-z][a-z.&']*/g, (w) => (keepUpper.has(w.replace(/[^a-z]/g, "").toUpperCase()) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)));
}

export function parseAwardResults(body: unknown): { awards: NormalizedAward[]; hasNext: boolean } {
  const b = (body ?? {}) as { results?: Record<string, unknown>[]; page_metadata?: { hasNext?: boolean } };
  const awards: NormalizedAward[] = [];
  for (const r of b.results ?? []) {
    const key = str(r.generated_internal_id) ?? str(r.internal_id);
    const recipient = str(r["Recipient Name"]);
    if (!key || !recipient) continue;
    const amount = typeof r["Award Amount"] === "number" ? (r["Award Amount"] as number) : Number(r["Award Amount"]);
    const naics = r.NAICS;
    awards.push({
      awardKey: key,
      piid: str(r["Award ID"]) ?? key,
      recipientName: displayRecipient(recipient),
      normalizedRecipient: normalizeCompany(recipient),
      agency: str(r["Awarding Agency"]) ?? "Unknown agency",
      subAgency: str(r["Awarding Sub Agency"]),
      description: str(r.Description),
      amountCents: Number.isFinite(amount) ? BigInt(Math.round(amount * 100)) : null,
      startDate: date(r["Start Date"]),
      endDate: date(r["End Date"]),
      naics: typeof naics === "string" ? naics : naics && typeof naics === "object" ? str((naics as { code?: unknown }).code) : null,
      placeState: str(r["Place of Performance State Code"]),
      url: `https://www.usaspending.gov/award/${encodeURIComponent(key)}`,
    });
  }
  return { awards, hasNext: Boolean(b.page_metadata?.hasNext) };
}

/** An award still in its period of performance, started within the last 18 months. */
export function isCurrentAward(a: { startDate: Date | null; endDate: Date | null }, now: Date): boolean {
  const eighteenMonths = 548 * 86_400_000;
  const started = !a.startDate || now.getTime() - a.startDate.getTime() <= eighteenMonths;
  const running = !a.endDate || a.endDate.getTime() >= now.getTime();
  return started && running;
}

export type CurrentAward = { agency: string; subAgency: string | null; endDate: Date | null; amountCents: bigint | null; piid: string };

/** The strongest current award for a company (largest obligated amount). */
export function pickCurrentAward<T extends CurrentAward & { startDate: Date | null }>(awards: T[], now: Date): T | null {
  const current = awards.filter((a) => isCurrentAward(a, now));
  if (!current.length) return null;
  const amt = (a: T) => a.amountCents ?? BigInt(0);
  return current.reduce((best, a) => (amt(a) > amt(best) ? a : best));
}

export function formatAwardAmount(cents: bigint | number | null): string {
  if (cents === null) return "—";
  const dollars = Number(cents) / 100;
  if (dollars >= 1e9) return `$${(dollars / 1e9).toFixed(1)}B`;
  if (dollars >= 1e6) return `$${(dollars / 1e6).toFixed(1)}M`;
  if (dollars >= 1e3) return `$${Math.round(dollars / 1e3)}K`;
  return `$${Math.round(dollars)}`;
}
