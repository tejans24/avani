import { getOk, type NormalizedPosting, type SourcePlugin } from "./types";

/**
 * USAJOBS Search API (public, documented; free key from developer.usajobs.gov):
 *   GET https://data.usajobs.gov/api/search?{query}&ResultsPerPage=500
 *   Headers: Host: data.usajobs.gov, User-Agent: <registered email>,
 *            Authorization-Key: <key>
 *   → { SearchResult: { SearchResultItems: [{ MatchedObjectId,
 *        MatchedObjectDescriptor: { PositionID, PositionTitle, PositionURI,
 *          PositionLocationDisplay, OrganizationName, DepartmentName,
 *          PublicationStartDate, QualificationSummary,
 *          PositionRemuneration: [{ MinimumRange, MaximumRange, RateIntervalCode }],
 *          UserArea: { Details: { JobSummary, MajorDuties: [], TeleworkEligible } } } }] } }
 *
 * Board slug is the query string, e.g. "JobCategoryCode=2210&RemoteIndicator=True"
 * (2210 = IT Management). Env: USAJOBS_API_KEY, USAJOBS_USER_AGENT (the email
 * the key was registered with; never hard-coded).
 */

type Descriptor = {
  PositionID?: string;
  PositionTitle: string;
  PositionURI: string;
  PositionLocationDisplay?: string;
  OrganizationName?: string;
  DepartmentName?: string;
  PublicationStartDate?: string;
  QualificationSummary?: string;
  PositionRemuneration?: { MinimumRange?: string; MaximumRange?: string; RateIntervalCode?: string }[];
  UserArea?: { Details?: { JobSummary?: string; MajorDuties?: string[]; TeleworkEligible?: boolean } };
};

const INTERVAL_TO_ANNUAL: Record<string, number> = { PA: 1, PH: 2080, PM: 12, BW: 26, WK: 52, PD: 260 };

export const usajobs: SourcePlugin = {
  source: "USAJOBS",
  async fetchBoard(board, ctx, { titleFilter }) {
    const key = process.env.USAJOBS_API_KEY;
    const agent = process.env.USAJOBS_USER_AGENT;
    if (process.env.JOBS_SOURCE_MODE !== "fake" && (!key || !agent)) {
      throw new Error("USAJOBS needs USAJOBS_API_KEY and USAJOBS_USER_AGENT");
    }
    const body = (await getOk(ctx, `https://data.usajobs.gov/api/search?${board.slug}&ResultsPerPage=500`, {
      headers: { Host: "data.usajobs.gov", "User-Agent": agent ?? "", "Authorization-Key": key ?? "" },
    })) as { SearchResult?: { SearchResultItems?: { MatchedObjectId: string; MatchedObjectDescriptor: Descriptor }[] } };

    const out: NormalizedPosting[] = [];
    for (const item of body.SearchResult?.SearchResultItems ?? []) {
      const d = item.MatchedObjectDescriptor;
      if (!titleFilter(d.PositionTitle)) continue;
      const pay = d.PositionRemuneration?.[0];
      const factor = INTERVAL_TO_ANNUAL[pay?.RateIntervalCode ?? "PA"] ?? 1;
      const cents = (v?: string) => (v && Number(v) > 0 ? Math.round(Number(v) * factor * 100) : null);
      const details = d.UserArea?.Details;
      const location = d.PositionLocationDisplay ?? "Unknown";
      out.push({
        source: "USAJOBS",
        sourceJobId: item.MatchedObjectId,
        title: d.PositionTitle.trim(),
        companyName: d.OrganizationName ?? d.DepartmentName ?? "U.S. Government",
        location,
        workModeHint: /remote/i.test(location) ? "REMOTE" : null,
        url: d.PositionURI,
        descriptionText: [details?.JobSummary, ...(details?.MajorDuties ?? []), d.QualificationSummary].filter(Boolean).join("\n"),
        postedAt: d.PublicationStartDate ? new Date(d.PublicationStartDate) : null,
        compMinCents: cents(pay?.MinimumRange),
        compMaxCents: cents(pay?.MaximumRange),
        raw: { MatchedObjectId: item.MatchedObjectId, DepartmentName: d.DepartmentName, TeleworkEligible: details?.TeleworkEligible },
      });
    }
    return out;
  },
};
