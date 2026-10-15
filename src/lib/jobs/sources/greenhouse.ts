import { decodeEntities, htmlToText } from "@/lib/jobs/capture";
import { parsePayRange } from "@/lib/jobs/pay";
import { getOk, type NormalizedPosting, type SourcePlugin } from "./types";

/**
 * Greenhouse Job Board API (public, documented):
 *   GET https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true
 *   → { jobs: [{ id, title, absolute_url, updated_at, first_published?,
 *                location: { name }, content (entity-encoded HTML) }] }
 * Pay is not structured on the list endpoint; it is parsed from the text.
 */

type GhJob = {
  id: number;
  title: string;
  absolute_url: string;
  updated_at?: string;
  first_published?: string;
  location?: { name?: string };
  content?: string;
};

export const greenhouse: SourcePlugin = {
  source: "GREENHOUSE",
  async fetchBoard(board, ctx, { titleFilter }) {
    const body = (await getOk(ctx, `https://boards-api.greenhouse.io/v1/boards/${board.slug}/jobs?content=true`)) as {
      jobs?: GhJob[];
    };
    const out: NormalizedPosting[] = [];
    for (const j of body.jobs ?? []) {
      if (!titleFilter(j.title)) continue;
      const descriptionText = htmlToText(decodeEntities(j.content ?? ""));
      const pay = parsePayRange(descriptionText);
      const posted = j.first_published ?? j.updated_at;
      out.push({
        source: "GREENHOUSE",
        sourceJobId: String(j.id),
        title: j.title.trim(),
        companyName: board.companyName,
        location: j.location?.name?.trim() || "Unknown",
        workModeHint: null,
        url: j.absolute_url,
        descriptionText,
        postedAt: posted ? new Date(posted) : null,
        compMinCents: pay?.minCents ?? null,
        compMaxCents: pay?.maxCents ?? null,
        raw: { ...j, content: undefined },
      });
    }
    return out;
  },
};
