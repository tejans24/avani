import { htmlToText } from "@/lib/jobs/capture";
import { parsePayRange } from "@/lib/jobs/pay";
import type { WorkMode } from "@/lib/jobs/scoring-config";
import { getOk, type NormalizedPosting, type SourcePlugin } from "./types";

/**
 * Workday career sites (the JSON the public careers page itself uses).
 * Only added as a board after scripts/verify-job-boards.ts confirms the
 * site's robots.txt allows /wday/cxs/. Board slug: "host/tenant/site", e.g.
 * "acme.wd5.myworkdayjobs.com/acme/External".
 *
 *   POST https://{host}/wday/cxs/{tenant}/{site}/jobs
 *        { appliedFacets: {}, limit: 20, offset, searchText }
 *   → { total, jobPostings: [{ title, externalPath, locationsText, postedOn }] }
 *   GET  https://{host}/wday/cxs/{tenant}/{site}{externalPath}
 *   → { jobPostingInfo: { id, jobReqId, title, jobDescription (HTML),
 *        location, startDate (YYYY-MM-DD), remoteType?, externalUrl } }
 *
 * Large contractors list thousands of jobs, so the list is narrowed by
 * search terms and the title prefilter, and detail fetches are capped.
 */

export const WORKDAY_SEARCH_TERMS = ["software engineer", "software developer", "architect", "full stack"];
const PAGE = 20;
const MAX_PAGES_PER_TERM = 5;
const MAX_DETAILS = 60;

type WdListItem = { title: string; externalPath: string; locationsText?: string; postedOn?: string };
type WdDetail = {
  jobPostingInfo?: {
    id?: string;
    jobReqId?: string;
    title?: string;
    jobDescription?: string;
    location?: string;
    startDate?: string;
    remoteType?: string;
    externalUrl?: string;
  };
};

/** "Posted Today" / "Posted Yesterday" / "Posted 3 Days Ago" / "Posted 30+ Days Ago". */
export function parsePostedOn(text: string | undefined, now: Date): Date | null {
  if (!text) return null;
  const t = text.toLowerCase();
  const day = 86_400_000;
  if (t.includes("today")) return now;
  if (t.includes("yesterday")) return new Date(now.getTime() - day);
  const m = t.match(/(\d+)\+?\s*days?/);
  return m ? new Date(now.getTime() - Number(m[1]) * day) : null;
}

function remoteHint(remoteType: string | undefined): WorkMode | null {
  const r = (remoteType ?? "").toLowerCase();
  if (r.includes("remote") || r.includes("telework")) return "REMOTE";
  if (r.includes("hybrid")) return "HYBRID";
  if (r.includes("on site") || r.includes("onsite") || r.includes("on-site")) return "ONSITE";
  return null;
}

export const workday: SourcePlugin = {
  source: "WORKDAY",
  async fetchBoard(board, ctx, { titleFilter }) {
    const [host, tenant, site] = board.slug.split("/");
    if (!host || !tenant || !site) throw new Error(`Workday board slug must be host/tenant/site, got "${board.slug}"`);
    const api = `https://${host}/wday/cxs/${tenant}/${site}`;

    const byPath = new Map<string, WdListItem>();
    for (const term of WORKDAY_SEARCH_TERMS) {
      for (let page = 0; page < MAX_PAGES_PER_TERM; page++) {
        const body = (await getOk(ctx, `${api}/jobs`, {
          method: "POST",
          body: { appliedFacets: {}, limit: PAGE, offset: page * PAGE, searchText: term },
        })) as { total?: number; jobPostings?: WdListItem[] };
        const rows = body.jobPostings ?? [];
        for (const r of rows) if (titleFilter(r.title)) byPath.set(r.externalPath, r);
        if (rows.length < PAGE) break;
      }
    }

    const out: NormalizedPosting[] = [];
    for (const item of [...byPath.values()].slice(0, MAX_DETAILS)) {
      const d = ((await getOk(ctx, `${api}${item.externalPath}`)) as WdDetail).jobPostingInfo ?? {};
      const descriptionText = htmlToText(d.jobDescription ?? "");
      const pay = parsePayRange(descriptionText);
      out.push({
        source: "WORKDAY",
        sourceJobId: d.jobReqId ?? d.id ?? item.externalPath,
        title: (d.title ?? item.title).trim(),
        companyName: board.companyName,
        location: d.location ?? item.locationsText ?? "Unknown",
        workModeHint: remoteHint(d.remoteType),
        url: d.externalUrl ?? `https://${host}/${site}${item.externalPath}`,
        descriptionText,
        postedAt: d.startDate ? new Date(d.startDate) : parsePostedOn(item.postedOn, ctx.now),
        compMinCents: pay?.minCents ?? null,
        compMaxCents: pay?.maxCents ?? null,
        raw: { ...item, remoteType: d.remoteType, jobReqId: d.jobReqId },
      });
    }
    return out;
  },
};
