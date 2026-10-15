import { db } from "@/lib/db";
import { emitEvent } from "@/lib/events/emit";
import {
  AWARD_MAX_PAGES,
  AWARDS_ENDPOINT,
  DEFAULT_AWARD_QUERIES,
  buildAwardSearchBody,
  formatAwardAmount,
  isCurrentAward,
  parseAwardResults,
  type AwardQueryDef,
  type NormalizedAward,
} from "@/lib/jobs/awards";
import { rescorePosting } from "@/lib/jobs/refresh";
import { sourceFetchCtx } from "@/lib/jobs/sources/http";
import type { FetchCtx } from "@/lib/jobs/sources/types";

/**
 * Awards refresh: one USAspending query per watched agency, about daily.
 * New awardees become JobCompany rows (leads), awards link to companies by
 * normalized name, and postings at companies whose current-award status
 * changed are rescored. A failed query records its error and changes nothing.
 */

export const AWARD_QUERY_STALE_HOURS = 20;

/** Seed the default agencies once (idempotent; never re-enables paused ones). */
export async function ensureDefaultAwardQueries(): Promise<void> {
  for (const q of DEFAULT_AWARD_QUERIES) {
    await db.awardQuery.upsert({
      where: { agencyTier_agencyName: { agencyTier: q.agencyTier, agencyName: q.agencyName } },
      create: { label: q.label, agencyTier: q.agencyTier, agencyName: q.agencyName, toptierName: q.toptierName ?? null, group: q.group },
      update: {},
    });
  }
}

async function upsertAward(a: NormalizedAward, queryId: string, now: Date): Promise<{ isNew: boolean; companyId: string }> {
  const company = await db.jobCompany.upsert({
    where: { normalizedName: a.normalizedRecipient || a.recipientName.toLowerCase() },
    create: { name: a.recipientName, normalizedName: a.normalizedRecipient || a.recipientName.toLowerCase(), lane: "GOV_CONTRACTOR" },
    update: {},
  });
  const existing = await db.contractAward.findUnique({ where: { awardKey: a.awardKey }, select: { id: true } });
  await db.contractAward.upsert({
    where: { awardKey: a.awardKey },
    create: { ...a, companyId: company.id, queryId, firstSeenAt: now, lastSeenAt: now },
    update: {
      amountCents: a.amountCents,
      description: a.description,
      startDate: a.startDate,
      endDate: a.endDate,
      companyId: company.id,
      lastSeenAt: now,
    },
  });
  return { isNew: !existing, companyId: company.id };
}

export type AwardQueryRun = { label: string; ok: boolean; error?: string; found: number; newAwards: number };

export async function refreshAwardQuery(queryId: string, ctx: FetchCtx): Promise<AwardQueryRun & { touchedCompanies: Set<string>; fresh: NormalizedAward[] }> {
  const q = await db.awardQuery.findUniqueOrThrow({ where: { id: queryId } });
  const def: AwardQueryDef = {
    label: q.label,
    agencyTier: q.agencyTier as AwardQueryDef["agencyTier"],
    agencyName: q.agencyName,
    toptierName: q.toptierName ?? undefined,
    group: q.group as AwardQueryDef["group"],
  };
  const touchedCompanies = new Set<string>();
  const fresh: NormalizedAward[] = [];
  let found = 0;
  try {
    for (let page = 1; page <= AWARD_MAX_PAGES; page++) {
      const res = await ctx.fetchJson(AWARDS_ENDPOINT, {
        method: "POST",
        body: buildAwardSearchBody(def, ctx.now, page),
        fixtureKey: `${q.label}_p${page}`,
      });
      if (res.status !== 200) throw new Error(`USAspending answered ${res.status}`);
      const { awards, hasNext } = parseAwardResults(res.body);
      for (const a of awards) {
        const r = await upsertAward(a, q.id, ctx.now);
        touchedCompanies.add(r.companyId);
        if (r.isNew) fresh.push(a);
      }
      found += awards.length;
      if (!hasNext) break;
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.awardQuery.update({ where: { id: q.id }, data: { lastFetchedAt: ctx.now, lastError: error } });
    return { label: q.label, ok: false, error, found, newAwards: fresh.length, touchedCompanies, fresh };
  }
  await db.awardQuery.update({ where: { id: q.id }, data: { lastFetchedAt: ctx.now, lastError: null } });
  return { label: q.label, ok: true, found, newAwards: fresh.length, touchedCompanies, fresh };
}

export async function runAwardsRefresh(opts: { now?: Date; maxQueries?: number; staleHours?: number; ctx?: FetchCtx } = {}): Promise<AwardQueryRun[]> {
  const now = opts.now ?? new Date();
  const ctx = opts.ctx ?? sourceFetchCtx(now);
  await ensureDefaultAwardQueries();
  const cutoff = new Date(now.getTime() - (opts.staleHours ?? AWARD_QUERY_STALE_HOURS) * 3600_000);
  const due = await db.awardQuery.findMany({
    where: { enabled: true, OR: [{ lastFetchedAt: null }, { lastFetchedAt: { lt: cutoff } }] },
    orderBy: [{ lastFetchedAt: { sort: "asc", nulls: "first" } }],
    take: opts.maxQueries ?? 1,
    select: { id: true },
  });

  const runs: AwardQueryRun[] = [];
  const touched = new Set<string>();
  const fresh: NormalizedAward[] = [];
  for (const { id } of due) {
    const r = await refreshAwardQuery(id, ctx);
    r.touchedCompanies.forEach((c) => touched.add(c));
    fresh.push(...r.fresh);
    runs.push({ label: r.label, ok: r.ok, error: r.error, found: r.found, newAwards: r.newAwards });
  }

  // Award status feeds scoring: rescore open postings at the companies touched.
  if (touched.size) {
    const postings = await db.jobPosting.findMany({ where: { companyId: { in: [...touched] }, closedAt: null }, select: { id: true } });
    for (const p of postings) await rescorePosting(p.id, now);
  }

  const current = fresh.filter((a) => isCurrentAward(a, now)).sort((a, b) => Number((b.amountCents ?? BigInt(0)) - (a.amountCents ?? BigInt(0))));
  if (current.length) {
    await db.$transaction(async (tx) => {
      await emitEvent(tx, "jobs.awards_found", {
        count: current.length,
        top: current.slice(0, 5).map((a) => ({
          recipient: a.recipientName,
          agency: a.subAgency && a.subAgency !== a.agency ? a.subAgency : a.agency,
          amount: formatAwardAmount(a.amountCents),
        })),
      });
    });
  }
  return runs;
}
