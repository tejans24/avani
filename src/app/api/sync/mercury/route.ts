import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { syncMercury } from "@/actions/mercury-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/sync/mercury — trigger a Mercury sync.
 *
 * Auth: signed-in allowlisted session only (AUTH_MODE=test bypasses for e2e).
 * Deliberately NOT reachable via the tick secret — a future cron can call
 * this with a session-scoped mechanism if needed.
 */
export async function POST() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await syncMercury();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
