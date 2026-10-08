import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { emitEvent } from "@/lib/events/emit";
import { formatAwardAmount, pickCurrentAward } from "@/lib/jobs/awards";
import { extractBenefits } from "@/lib/jobs/benefits";
import { normalizeCompany, resolveBatch, sourceIdKey, type ExistingIndex, type Incoming } from "@/lib/jobs/dedupe";
import { parsePayRange } from "@/lib/jobs/pay";
import { SCORING_VERSION, passesTitlePrefilter, type Lane, type WorkMode } from "@/lib/jobs/scoring-config";
import { scorePosting } from "@/lib/jobs/scoring";
import { sourceFetchCtx } from "@/lib/jobs/sources/http";
import { pluginFor } from "@/lib/jobs/sources/index";
import type { FetchCtx, NormalizedPosting, SourceName } from "@/lib/jobs/sources/types";

/**
 * The refresh pipeline: fetch boards → reject duplicates → create/refresh
 * postings → score + extract benefits → close postings that vanished →
 * announce strong new matches. Called a few boards at a time from the event
 * tick (so a serverless run stays short) and in full from
 * `npm run jobs:refresh`.
 *
 * Duplicate rejection happens before any write (dedupe.ts); the unique
 * dedupeKey index is the backstop.
 */

/** New passing postings at or above this score are announced. */
export const NOTIFY_MIN_SCORE = 70;
/** A board is due for refresh after this long. */
export const BOARD_STALE_HOURS = 20;

type Json = Prisma.InputJsonValue;

export type IngestReport = {
  created: { id: string; title: string; companyName: string; score: number; passed: boolean }[];
  refreshed: number;
  aliased: number;
  dismissed: number;
  seenPostingIds: Set<string>;
};

async function loadIndex(): Promise<ExistingIndex> {
  const [postings, aliases, dismissals] = await Promise.all([
    db.jobPosting.findMany({ select: { id: true, source: true, sourceJobId: true, dedupeKey: true } }),
    db.jobPostingAlias.findMany({ select: { postingId: true, source: true, sourceJobId: true } }),
    db.jobDismissal.findMany({ select: { source: true, sourceJobId: true, dedupeKey: true } }),
  ]);
  const bySourceId = new Map<string, string>();
  const byKey = new Map<string, string>();
  for (const p of postings) {
    bySourceId.set(sourceIdKey(p.source, p.sourceJobId), p.id);
    byKey.set(p.dedupeKey, p.id);
  }
  for (const a of aliases) bySourceId.set(sourceIdKey(a.source, a.sourceJobId), a.postingId);
  return {
    bySourceId,
    byKey,
    dismissedSourceIds: new Set(dismissals.map((d) => sourceIdKey(d.source, d.sourceJobId))),
    dismissedKeys: new Set(dismissals.map((d) => d.dedupeKey)),
  };
}

async function upsertCompany(name: string) {
  const normalizedName = normalizeCompany(name) || name.toLowerCase();
  return db.jobCompany.upsert({
    where: { normalizedName },
    create: { name, normalizedName },
    update: {},
  });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "NOAA · $48.3M · through Aug 2031" for the company's strongest current award. */
export async function currentAwardSummary(companyId: string, now: Date): Promise<{ summary: string } | null> {
  const awards = await db.contractAward.findMany({
    where: { companyId, OR: [{ endDate: null }, { endDate: { gte: now } }] },
    select: { agency: true, subAgency: true, endDate: true, amountCents: true, piid: true, startDate: true },
  });
  const best = pickCurrentAward(awards, now);
  if (!best) return null;
  const who = best.subAgency && best.subAgency !== best.agency ? best.subAgency : best.agency;
  const until = best.endDate ? ` · through ${MONTHS[best.endDate.getUTCMonth()]} ${best.endDate.getUTCFullYear()}` : "";
  return { summary: `${who} · ${formatAwardAmount(best.amountCents)}${until} (${best.piid})` };
}

/** Scoring + benefits columns for a posting, from its current content. */
export function derivedFields(
  p: Pick<NormalizedPosting, "title" | "descriptionText" | "location" | "companyName" | "source" | "postedAt" | "compMinCents" | "compMaxCents" | "workModeHint">,
  opts: { isStaffingAgency: boolean; laneOverride: Lane | null; workModeOverride?: WorkMode | null; now: Date; currentAward?: { summary: string } | null }
) {
  const r = scorePosting(
    {
      title: p.title,
      descriptionText: p.descriptionText,
      location: p.location,
      companyName: p.companyName,
      source: p.source,
      postedAt: p.postedAt,
      compMinCents: p.compMinCents,
      compMaxCents: p.compMaxCents,
      workModeHint: opts.workModeOverride ?? p.workModeHint,
      isStaffingAgency: opts.isStaffingAgency,
      laneOverride: opts.laneOverride,
      currentAward: opts.currentAward ?? null,
    },
    opts.now
  );
  return {
    workMode: r.workMode,
    lane: r.lane,
    filterFailures: r.filterFailures,
    score: r.score,
    scoreBreakdown: r.breakdown as unknown as Json,
    scoreFlags: r.flags,
    scoringVersion: r.scoringVersion,
    scoredAt: opts.now,
    benefits: extractBenefits(p.descriptionText) as unknown as Json,
  };
}

/**
 * Ingest normalized postings (from a board, or one manual capture). Returns
 * what happened to each, and the posting ids seen (for closing vanished ones).
 */
export async function ingestPostings(
  items: (NormalizedPosting | (Omit<NormalizedPosting, "source"> & { source: "MANUAL"; capturedVia?: string }))[],
  opts: { boardId?: string | null; now: Date }
): Promise<IngestReport> {
  const report: IngestReport = { created: [], refreshed: 0, aliased: 0, dismissed: 0, seenPostingIds: new Set() };
  const index = await loadIndex();
  const incoming: Incoming[] = items.map((i) => ({
    source: i.source,
    sourceJobId: i.sourceJobId,
    title: i.title,
    companyName: i.companyName,
    location: i.location,
  }));
  const resolved = resolveBatch(incoming, index);
  // Batch-internal duplicates point at "pending:<sourceIdKey>" until created.
  const createdBySourceId = new Map<string, string>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const { resolution } = resolved[i];

    if (resolution.action === "dismissed") {
      report.dismissed++;
      continue;
    }

    if (resolution.action === "alias") {
      const postingId = resolution.postingId.startsWith("pending:")
        ? createdBySourceId.get(resolution.postingId.slice("pending:".length))
        : resolution.postingId;
      if (!postingId) continue;
      await db.jobPostingAlias.upsert({
        where: { source_sourceJobId: { source: item.source, sourceJobId: item.sourceJobId } },
        create: { postingId, source: item.source, sourceJobId: item.sourceJobId, url: item.url, firstSeenAt: opts.now, lastSeenAt: opts.now },
        update: { lastSeenAt: opts.now, url: item.url },
      });
      await db.jobPosting.update({ where: { id: postingId }, data: { lastSeenAt: opts.now, closedAt: null } });
      report.aliased++;
      report.seenPostingIds.add(postingId);
      continue;
    }

    if (resolution.action === "refresh") {
      const existing = await db.jobPosting.findUnique({
        where: { id: resolution.postingId },
        include: { company: { select: { isStaffingAgency: true } } },
      });
      if (!existing) continue;
      // Content from the posting's own source refreshes it; an alias only marks it seen.
      const own = existing.source === item.source && existing.sourceJobId === item.sourceJobId;
      await db.jobPosting.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: opts.now,
          closedAt: null,
          ...(own
            ? {
                // The fit analysis read the old text or pay: drop it rather than show it stale.
                ...(existing.descriptionText !== item.descriptionText ||
                existing.compMinCents !== item.compMinCents ||
                existing.compMaxCents !== item.compMaxCents
                  ? { fitAnalysis: Prisma.DbNull, fitAnalyzedAt: null }
                  : {}),
                title: item.title,
                location: item.location,
                url: item.url,
                descriptionText: item.descriptionText,
                compMinCents: item.compMinCents,
                compMaxCents: item.compMaxCents,
                postedAt: item.postedAt ?? existing.postedAt,
                raw: item.raw as Json,
                ...derivedFields(item as NormalizedPosting, {
                  isStaffingAgency: existing.company.isStaffingAgency,
                  laneOverride: existing.laneOverride,
                  workModeOverride: existing.workModeOverride as WorkMode | null,
                  now: opts.now,
                  currentAward: await currentAwardSummary(existing.companyId, opts.now),
                }),
              }
            : {}),
        },
      });
      report.refreshed++;
      report.seenPostingIds.add(existing.id);
      continue;
    }

    // create
    const company = await upsertCompany(item.companyName);
    const derived = derivedFields(item as NormalizedPosting, {
      isStaffingAgency: company.isStaffingAgency,
      laneOverride: null,
      now: opts.now,
      currentAward: await currentAwardSummary(company.id, opts.now),
    });
    try {
      const created = await db.jobPosting.create({
        data: {
          source: item.source,
          sourceJobId: item.sourceJobId,
          boardId: opts.boardId ?? null,
          companyId: company.id,
          title: item.title,
          location: item.location,
          url: item.url,
          descriptionText: item.descriptionText,
          compMinCents: item.compMinCents,
          compMaxCents: item.compMaxCents,
          postedAt: item.postedAt,
          firstSeenAt: opts.now,
          lastSeenAt: opts.now,
          dedupeKey: resolution.dedupeKey,
          capturedVia: "capturedVia" in item ? item.capturedVia ?? null : null,
          raw: (item.raw ?? {}) as Json,
          ...derived,
        },
      });
      createdBySourceId.set(sourceIdKey(item.source, item.sourceJobId), created.id);
      report.seenPostingIds.add(created.id);
      report.created.push({
        id: created.id,
        title: created.title,
        companyName: company.name,
        score: derived.score,
        passed: derived.filterFailures.length === 0,
      });
    } catch (e) {
      // Unique dedupeKey backstop: a concurrent run created it first. Treat as an alias.
      if ((e as { code?: string }).code === "P2002") {
        const winner = await db.jobPosting.findUnique({ where: { dedupeKey: resolution.dedupeKey }, select: { id: true } });
        if (winner) {
          await db.jobPostingAlias.upsert({
            where: { source_sourceJobId: { source: item.source, sourceJobId: item.sourceJobId } },
            create: { postingId: winner.id, source: item.source, sourceJobId: item.sourceJobId, url: item.url },
            update: { lastSeenAt: opts.now },
          });
          report.aliased++;
          report.seenPostingIds.add(winner.id);
          continue;
        }
      }
      throw e;
    }
  }
  return report;
}

export type BoardRunResult = { boardId: string; companyName: string; ok: boolean; error?: string; report?: Omit<IngestReport, "seenPostingIds"> };

export async function refreshBoard(boardId: string, ctx: FetchCtx): Promise<BoardRunResult> {
  const board = await db.jobBoard.findUniqueOrThrow({ where: { id: boardId } });
  const plugin = pluginFor(board.source);
  if (!plugin) {
    await db.jobBoard.update({ where: { id: boardId }, data: { lastFetchedAt: ctx.now, lastError: `No plugin for ${board.source}` } });
    return { boardId, companyName: board.companyName, ok: false, error: `No plugin for ${board.source}` };
  }
  let postings: NormalizedPosting[];
  try {
    const slug = board.source === "WORKDAY" && board.host ? `${board.host}/${board.slug}` : board.slug;
    postings = await plugin.fetchBoard(
      { source: board.source as SourceName, slug, companyName: board.companyName },
      ctx,
      { titleFilter: passesTitlePrefilter }
    );
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    // A failed fetch never closes postings: we don't know they're gone.
    await db.jobBoard.update({ where: { id: boardId }, data: { lastFetchedAt: ctx.now, lastError: error } });
    return { boardId, companyName: board.companyName, ok: false, error };
  }

  const report = await ingestPostings(postings, { boardId, now: ctx.now });
  // Postings from this board that this run no longer sees are closed.
  await db.jobPosting.updateMany({
    where: { boardId, closedAt: null, id: { notIn: [...report.seenPostingIds] } },
    data: { closedAt: ctx.now },
  });
  await db.jobBoard.update({ where: { id: boardId }, data: { lastFetchedAt: ctx.now, lastError: null } });
  const { seenPostingIds: _seen, ...rest } = report;
  return { boardId, companyName: board.companyName, ok: true, report: rest };
}

/**
 * Recompute one posting's derived fields from its stored content, company
 * flags, lane and work-mode overrides and current award. The one rescoring
 * path, used by version bumps, award updates, and owner edits.
 */
export async function rescorePosting(id: string, now: Date): Promise<void> {
  const found = await db.jobPosting.findUniqueOrThrow({ where: { id }, include: { company: { select: { name: true, isStaffingAgency: true } } } });
  // A job added by hand with no pay saved: read it from the text again (the parser improves over time).
  const reread = found.source === "MANUAL" && found.compMinCents === null && found.compMaxCents === null ? parsePayRange(found.descriptionText) : null;
  const p = reread ? { ...found, compMinCents: reread.minCents, compMaxCents: reread.maxCents } : found;
  await db.jobPosting.update({
    where: { id },
    data: {
      ...(reread ? { compMinCents: reread.minCents, compMaxCents: reread.maxCents } : {}),
      ...derivedFields(
      {
        ...p,
        companyName: p.company.name,
        source: p.source as SourceName,
        // Feeds' own flags (Workday remoteType) live only in the stored mode; jobs added by hand are re-read from their text.
        workModeHint: p.source === "MANUAL" || p.workMode === "UNKNOWN" ? null : (p.workMode as WorkMode),
      },
      {
        isStaffingAgency: p.company.isStaffingAgency,
        laneOverride: p.laneOverride,
        workModeOverride: p.workModeOverride as WorkMode | null,
        now,
        currentAward: await currentAwardSummary(p.companyId, now),
      }
    ),
    },
  });
}

/** Rescore postings scored under an older SCORING_VERSION (after config edits). */
export async function rescoreStale(now: Date, limit = 500): Promise<number> {
  const stale = await db.jobPosting.findMany({
    where: { OR: [{ scoringVersion: null }, { scoringVersion: { not: SCORING_VERSION } }] },
    select: { id: true },
    take: limit,
  });
  for (const p of stale) await rescorePosting(p.id, now);
  return stale.length;
}

export type RefreshRun = { boards: BoardRunResult[]; rescored: number; announced: number };

/**
 * Refresh the boards that are due (oldest first), rescore stale postings,
 * and announce strong new matches in one event.
 */
export async function runJobRefresh(opts: { now?: Date; maxBoards?: number; staleHours?: number; ctx?: FetchCtx } = {}): Promise<RefreshRun> {
  const now = opts.now ?? new Date();
  const ctx = opts.ctx ?? sourceFetchCtx(now);
  const cutoff = new Date(now.getTime() - (opts.staleHours ?? BOARD_STALE_HOURS) * 3600_000);
  const due = await db.jobBoard.findMany({
    where: { enabled: true, OR: [{ lastFetchedAt: null }, { lastFetchedAt: { lt: cutoff } }] },
    orderBy: [{ lastFetchedAt: { sort: "asc", nulls: "first" } }],
    take: opts.maxBoards ?? 3,
    select: { id: true },
  });

  const boards: BoardRunResult[] = [];
  for (const b of due) boards.push(await refreshBoard(b.id, ctx));
  const rescored = await rescoreStale(now);

  const matches = boards
    .flatMap((b) => b.report?.created ?? [])
    .filter((c) => c.passed && c.score >= NOTIFY_MIN_SCORE)
    .sort((a, b) => b.score - a.score);
  if (matches.length) {
    await db.$transaction(async (tx) => {
      await emitEvent(tx, "jobs.new_matches", {
        count: matches.length,
        top: matches.slice(0, 5).map((m) => ({ postingId: m.id, title: m.title, companyName: m.companyName, score: m.score })),
      });
    });
  }
  return { boards, rescored, announced: matches.length };
}
