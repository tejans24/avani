import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { ClaudeProgress } from "@/lib/jobs/claude-structured";
import { FIT_VERDICT_LABEL, type FitAnalysis } from "@/lib/jobs/fit";
import type { BreakdownEntry } from "@/lib/jobs/scoring";
import type { Lane, WorkMode } from "@/lib/jobs/scoring-config";

/** One line of the Evaluate button's progress stream (newline-delimited JSON, api/jobs/[id]/evaluate). */
export type EvaluateEvent =
  | { type: "started" }
  | { type: "thinking"; text: string }
  | { type: "writing"; chars: number }
  | { type: "done"; analysis: FitAnalysis }
  | { type: "error"; message: string };

/**
 * Run the job posting evaluator on one posting and save the result. Used by
 * the Evaluate button (with live progress) and "Have Claude read the next
 * few". Logs a line at the start and end, so a slow or failed run shows up in
 * the server log.
 */
export async function evaluatePosting(postingId: string, onProgress?: (p: ClaudeProgress) => void): Promise<FitAnalysis> {
  const posting = await db.jobPosting.findUnique({ where: { id: postingId }, include: { company: { select: { name: true } } } });
  if (!posting) throw new Error("Job not found");
  const master = await db.resumeMaster.findFirst({ orderBy: { version: "desc" }, select: { data: true } });
  if (!master) throw new Error("Import your master résumé first (Jobs → Résumé) so the analysis can compare it.");
  const { resumeSchema } = await import("@/lib/jobs/resume-schema");
  const { analyzeFitWithClaude } = await import("@/lib/jobs/fit-ai");

  const started = Date.now();
  const label = `[evaluate] ${posting.title} at ${posting.company.name} (${postingId})`;
  console.info(`${label}: started`);
  try {
    const now = new Date();
    const analysis = await analyzeFitWithClaude({
      master: resumeSchema.parse(master.data),
      posting: {
        title: posting.title,
        companyName: posting.company.name,
        location: posting.location,
        workMode: posting.workMode as WorkMode,
        compMinCents: posting.compMinCents,
        compMaxCents: posting.compMaxCents,
        postedAt: posting.postedAt,
        url: posting.url,
        filterFailures: posting.filterFailures,
        descriptionText: posting.descriptionText,
        lane: posting.lane as Lane,
        tailoringNotes: posting.tailoringNotes,
      },
      breakdown: posting.scoreBreakdown as unknown as BreakdownEntry[],
      now,
      onProgress,
    });
    await db.jobPosting.update({
      where: { id: postingId },
      data: { fitAnalysis: analysis as unknown as Prisma.InputJsonValue, fitAnalyzedAt: now },
    });
    console.info(`${label}: ${FIT_VERDICT_LABEL[analysis.verdict]} in ${Math.round((Date.now() - started) / 1000)}s`);
    return analysis;
  } catch (e) {
    console.error(`${label}: failed after ${Math.round((Date.now() - started) / 1000)}s: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}
