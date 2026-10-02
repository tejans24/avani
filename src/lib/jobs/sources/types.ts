import type { WorkMode } from "@/lib/jobs/scoring-config";

/**
 * The contract every job source implements. A plugin turns one JobBoard into
 * NormalizedPostings; everything after that (title prefilter, duplicate
 * rejection, scoring, benefits, tracking) is shared in refresh.ts.
 *
 * Plugins never call fetch directly: they use ctx.fetchJson, which is polite
 * in live mode (user-agent, timeout, pause between requests) and reads
 * fixtures in fake mode (JOBS_SOURCE_MODE=fake), like MERCURY_MODE.
 */

export type SourceName = "GREENHOUSE" | "LEVER" | "ASHBY" | "SMARTRECRUITERS" | "WORKDAY" | "USAJOBS";

export type BoardRef = {
  source: SourceName;
  /** Greenhouse/Lever/Ashby/SmartRecruiters board id; Workday "host/tenant/site"; USAJOBS query string. */
  slug: string;
  companyName: string;
};

export type NormalizedPosting = {
  source: SourceName;
  sourceJobId: string;
  title: string;
  companyName: string;
  location: string;
  workModeHint: WorkMode | null;
  url: string;
  descriptionText: string;
  postedAt: Date | null;
  compMinCents: number | null;
  compMaxCents: number | null;
  raw: unknown;
};

export type FetchResult = { status: number; body: unknown };

export type FetchCtx = {
  fetchJson(
    url: string,
    init?: {
      method?: "GET" | "POST";
      body?: unknown;
      headers?: Record<string, string>;
      /** Fake mode only: names the fixture when one URL serves many requests. */
      fixtureKey?: string;
    }
  ): Promise<FetchResult>;
  now: Date;
};

export type SourcePlugin = {
  source: SourceName;
  /**
   * Fetch one board's current postings. Throws on a failed fetch (network,
   * non-200) so refresh.ts records the error and does not mark the board's
   * postings closed.
   */
  fetchBoard(board: BoardRef, ctx: FetchCtx, opts: { titleFilter: (title: string) => boolean }): Promise<NormalizedPosting[]>;
};

export class SourceFetchError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export async function getOk(ctx: FetchCtx, url: string, init?: Parameters<FetchCtx["fetchJson"]>[1]): Promise<unknown> {
  const res = await ctx.fetchJson(url, init);
  if (res.status !== 200) throw new SourceFetchError(`HTTP ${res.status} from ${new URL(url).hostname}`, res.status);
  return res.body;
}
