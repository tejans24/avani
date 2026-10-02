import { htmlToText } from "@/lib/jobs/capture";
import { parsePayRange } from "@/lib/jobs/pay";
import type { WorkMode } from "@/lib/jobs/scoring-config";
import { getOk, type NormalizedPosting, type SourcePlugin } from "./types";

/**
 * Ashby Job Posting API (public, documented):
 *   GET https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true
 *   → { jobs: [{ id, title, location, isRemote, workplaceType?, publishedAt,
 *                jobUrl, descriptionPlain?, descriptionHtml?,
 *                compensation?: { summaryComponents: [{ compensationType,
 *                  interval, currencyCode, minValue, maxValue }] } }] }
 */

type AshbyComp = { compensationType?: string; interval?: string; currencyCode?: string; minValue?: number; maxValue?: number };
type AshbyJob = {
  id: string;
  title: string;
  location?: string;
  isRemote?: boolean;
  workplaceType?: string;
  publishedAt?: string;
  jobUrl: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
  compensation?: { summaryComponents?: AshbyComp[] };
};

const WORKPLACE: Record<string, WorkMode> = { remote: "REMOTE", hybrid: "HYBRID", onsite: "ONSITE" };

function salary(job: AshbyJob): { min: number | null; max: number | null } {
  const c = job.compensation?.summaryComponents?.find((s) => s.compensationType === "Salary" && (s.currencyCode ?? "USD") === "USD");
  if (!c || (!c.minValue && !c.maxValue)) return { min: null, max: null };
  const factor = /hour/i.test(c.interval ?? "") ? 2080 : /month/i.test(c.interval ?? "") ? 12 : 1;
  const v = (n?: number) => (n ? Math.round(n * factor * 100) : null);
  return { min: v(c.minValue ?? c.maxValue), max: v(c.maxValue ?? c.minValue) };
}

export const ashby: SourcePlugin = {
  source: "ASHBY",
  async fetchBoard(board, ctx, { titleFilter }) {
    const body = (await getOk(ctx, `https://api.ashbyhq.com/posting-api/job-board/${board.slug}?includeCompensation=true`)) as {
      jobs?: AshbyJob[];
    };
    const out: NormalizedPosting[] = [];
    for (const j of body.jobs ?? []) {
      if (!titleFilter(j.title)) continue;
      const descriptionText = (j.descriptionPlain ?? htmlToText(j.descriptionHtml ?? "")).trim();
      let { min, max } = salary(j);
      if (min === null) {
        const pay = parsePayRange(descriptionText);
        min = pay?.minCents ?? null;
        max = pay?.maxCents ?? null;
      }
      const hint = WORKPLACE[(j.workplaceType ?? "").toLowerCase()] ?? (j.isRemote ? "REMOTE" : null);
      out.push({
        source: "ASHBY",
        sourceJobId: j.id,
        title: j.title.trim(),
        companyName: board.companyName,
        location: j.location?.trim() || (j.isRemote ? "Remote" : "Unknown"),
        workModeHint: hint,
        url: j.jobUrl,
        descriptionText,
        postedAt: j.publishedAt ? new Date(j.publishedAt) : null,
        compMinCents: min,
        compMaxCents: max,
        raw: { id: j.id, isRemote: j.isRemote, workplaceType: j.workplaceType, compensation: j.compensation },
      });
    }
    return out;
  },
};
