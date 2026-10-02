import { htmlToText } from "@/lib/jobs/capture";
import { parsePayRange } from "@/lib/jobs/pay";
import { getOk, type NormalizedPosting, type SourcePlugin } from "./types";

/**
 * SmartRecruiters Posting API (public, documented):
 *   GET https://api.smartrecruiters.com/v1/companies/{company}/postings?limit=100&offset=N
 *   → { totalFound, content: [{ id, name, releasedDate, location: { city,
 *        region, country, remote } }] }
 *   GET https://api.smartrecruiters.com/v1/companies/{company}/postings/{id}
 *   → { jobAd: { sections: { companyDescription, jobDescription,
 *        qualifications, additionalInformation: { text } } }, postingUrl? }
 * The list has no description, so details are fetched only for postings
 * that pass the title prefilter, capped per run.
 */

type SrItem = {
  id: string;
  name: string;
  releasedDate?: string;
  location?: { city?: string; region?: string; country?: string; remote?: boolean };
};
type SrDetail = {
  postingUrl?: string;
  jobAd?: { sections?: Record<string, { text?: string } | undefined> };
};

const PAGE = 100;
const MAX_PAGES = 5;
const MAX_DETAILS = 60;

export const smartrecruiters: SourcePlugin = {
  source: "SMARTRECRUITERS",
  async fetchBoard(board, ctx, { titleFilter }) {
    const base = `https://api.smartrecruiters.com/v1/companies/${board.slug}/postings`;
    const items: SrItem[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const body = (await getOk(ctx, `${base}?limit=${PAGE}&offset=${page * PAGE}`)) as { totalFound?: number; content?: SrItem[] };
      items.push(...(body.content ?? []));
      if ((body.content ?? []).length < PAGE) break;
    }
    const out: NormalizedPosting[] = [];
    for (const it of items.filter((i) => titleFilter(i.name)).slice(0, MAX_DETAILS)) {
      const d = (await getOk(ctx, `${base}/${it.id}`)) as SrDetail;
      const sections = d.jobAd?.sections ?? {};
      const descriptionText = ["jobDescription", "qualifications", "additionalInformation", "companyDescription"]
        .map((k) => htmlToText(sections[k]?.text ?? ""))
        .filter(Boolean)
        .join("\n");
      const pay = parsePayRange(descriptionText);
      const loc = it.location ?? {};
      const location = loc.remote ? "Remote" : [loc.city, loc.region].filter(Boolean).join(", ") || loc.country || "Unknown";
      out.push({
        source: "SMARTRECRUITERS",
        sourceJobId: it.id,
        title: it.name.trim(),
        companyName: board.companyName,
        location,
        workModeHint: loc.remote ? "REMOTE" : null,
        url: d.postingUrl ?? `https://jobs.smartrecruiters.com/${board.slug}/${it.id}`,
        descriptionText,
        postedAt: it.releasedDate ? new Date(it.releasedDate) : null,
        compMinCents: pay?.minCents ?? null,
        compMaxCents: pay?.maxCents ?? null,
        raw: it,
      });
    }
    return out;
  },
};
