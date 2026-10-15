import { htmlToText } from "@/lib/jobs/capture";
import { parsePayRange } from "@/lib/jobs/pay";
import type { WorkMode } from "@/lib/jobs/scoring-config";
import { getOk, type NormalizedPosting, type SourcePlugin } from "./types";

/**
 * Lever Postings API (public, documented):
 *   GET https://api.lever.co/v0/postings/{site}?mode=json
 *   → [{ id, text, hostedUrl, createdAt (ms), workplaceType,
 *        categories: { location, allLocations }, descriptionPlain,
 *        lists: [{ text, content (HTML) }], additionalPlain,
 *        salaryRange?: { min, max, currency, interval } }]
 */

type LeverJob = {
  id: string;
  text: string;
  hostedUrl: string;
  createdAt?: number;
  workplaceType?: string;
  categories?: { location?: string; allLocations?: string[] };
  descriptionPlain?: string;
  lists?: { text: string; content: string }[];
  additionalPlain?: string;
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
};

const WORKPLACE: Record<string, WorkMode> = { remote: "REMOTE", hybrid: "HYBRID", "on-site": "ONSITE", onsite: "ONSITE" };

function salary(r: LeverJob["salaryRange"]): { min: number | null; max: number | null } {
  if (!r || (r.currency && r.currency !== "USD") || (!r.min && !r.max)) return { min: null, max: null };
  const factor = /hour/i.test(r.interval ?? "") ? 2080 : /month/i.test(r.interval ?? "") ? 12 : 1;
  const c = (n?: number) => (n ? Math.round(n * factor * 100) : null);
  return { min: c(r.min ?? r.max), max: c(r.max ?? r.min) };
}

export const lever: SourcePlugin = {
  source: "LEVER",
  async fetchBoard(board, ctx, { titleFilter }) {
    const body = (await getOk(ctx, `https://api.lever.co/v0/postings/${board.slug}?mode=json`)) as LeverJob[];
    const out: NormalizedPosting[] = [];
    for (const j of Array.isArray(body) ? body : []) {
      if (!titleFilter(j.text)) continue;
      const descriptionText = [
        j.descriptionPlain ?? "",
        ...(j.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`),
        j.additionalPlain ?? "",
      ]
        .filter(Boolean)
        .join("\n")
        .trim();
      let { min, max } = salary(j.salaryRange);
      if (min === null) {
        const pay = parsePayRange(descriptionText);
        min = pay?.minCents ?? null;
        max = pay?.maxCents ?? null;
      }
      out.push({
        source: "LEVER",
        sourceJobId: j.id,
        title: j.text.trim(),
        companyName: board.companyName,
        location: j.categories?.location?.trim() || "Unknown",
        workModeHint: WORKPLACE[(j.workplaceType ?? "").toLowerCase()] ?? null,
        url: j.hostedUrl,
        descriptionText,
        postedAt: j.createdAt ? new Date(j.createdAt) : null,
        compMinCents: min,
        compMaxCents: max,
        raw: { id: j.id, workplaceType: j.workplaceType, categories: j.categories, salaryRange: j.salaryRange },
      });
    }
    return out;
  },
};
