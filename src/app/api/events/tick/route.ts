import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runDetectors } from "@/lib/events/detectors";
import { dispatchPending } from "@/lib/events/dispatch";
import { runJobRefresh } from "@/lib/jobs/refresh";
import "@/lib/events/register";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Job-board refreshes make outbound requests; give the tick room to finish.
export const maxDuration = 60;

/**
 * The clock. Vercel cron hits this every 15 minutes (vercel.json). Three jobs:
 * 1. run detectors (turn dates crossing into events)
 * 2. refresh a couple of due job boards (JOBS_REFRESH=off disables)
 * 3. sweep + dispatch unprocessed events (this is also the retry path)
 *
 * Auth: TICK_SECRET query param or Vercel cron's Authorization header.
 * A `now` query param (ISO date) is accepted ONLY in test auth mode so e2e
 * specs can simulate time passing.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  // Vercel cron authenticates with `Authorization: Bearer $CRON_SECRET`;
  // manual/external pingers may use ?secret=TICK_SECRET.
  const secret = process.env.TICK_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const authorized =
    process.env.AUTH_MODE === "test" ||
    (secret && url.searchParams.get("secret") === secret) ||
    (secret && authHeader === `Bearer ${secret}`) ||
    (cronSecret && authHeader === `Bearer ${cronSecret}`);
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let now = new Date();
  const nowParam = url.searchParams.get("now");
  if (nowParam && process.env.AUTH_MODE === "test") {
    now = new Date(nowParam + (nowParam.length === 10 ? "T12:00:00Z" : ""));
  }

  const detected = await runDetectors(now);

  // Job finder: refresh a few due boards per tick (each board ~daily). A
  // failure here must never stop the rest of the tick.
  let jobs: { boards: number; failed: number; announced: number } | { error: string } = { boards: 0, failed: 0, announced: 0 };
  if (process.env.JOBS_REFRESH !== "off") {
    try {
      const run = await runJobRefresh({ now, maxBoards: 2 });
      jobs = { boards: run.boards.length, failed: run.boards.filter((b) => !b.ok).length, announced: run.announced };
    } catch (e) {
      jobs = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  const dispatched = await dispatchPending(now);

  // Watchdog: the dashboard warns when this goes stale (> 2h).
  await db.companySettings.update({
    where: { id: 1 },
    data: { lastTickAt: new Date() },
  });

  // External dead-man's switch: if the app stops ticking entirely, something
  // OUTSIDE this infrastructure (healthchecks.io) notices the missing ping.
  const pingUrl = process.env.HEALTHCHECK_PING_URL;
  if (pingUrl) {
    fetch(pingUrl).catch(() => {});
  }

  return NextResponse.json({ ok: true, detected, jobs, dispatched });
}
