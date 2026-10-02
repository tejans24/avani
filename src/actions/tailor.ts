"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { defaultNextAction } from "@/lib/jobs/pipeline";
import { resumeSchema, type Resume } from "@/lib/jobs/resume-schema";
import { checkStyle } from "@/lib/jobs/resume-style";
import { checkDocStyle, checkTruth, hasBlocking, quickTailor, type TailoredDoc } from "@/lib/jobs/tailor";
import { tailorWithClaude } from "@/lib/jobs/tailor-ai";
import type { Lane } from "@/lib/jobs/scoring-config";

export type TailorResult = { ok: true; id?: string; version?: number; note?: string } | { ok: false; error: string };

const fail = (e: unknown): TailorResult => ({ ok: false, error: e instanceof Error ? e.message : "Something went wrong" });

/**
 * Import a new master résumé version (append-only; the UI never edits
 * master). Reports how many lines the style guard would flag, for info.
 */
export async function importMasterResume(jsonText: string): Promise<TailorResult> {
  try {
    await requireAuth();
    let raw: unknown;
    try {
      raw = JSON.parse(jsonText);
    } catch {
      return { ok: false, error: "That isn't valid JSON." };
    }
    const parsed = resumeSchema.safeParse(raw);
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      return { ok: false, error: `${i.path.join(".") || "résumé"}: ${i.message}` };
    }
    const latest = await db.resumeMaster.findFirst({ orderBy: { version: "desc" }, select: { version: true } });
    const version = (latest?.version ?? 0) + 1;
    const created = await db.resumeMaster.create({ data: { version, data: parsed.data as unknown as Prisma.InputJsonValue } });
    const m = parsed.data;
    const flagged = [m.summary, ...m.experience.flatMap((e) => e.bullets.map((b) => b.text))].filter((t) => checkStyle(t).length > 0).length;
    revalidatePath("/jobs/resume");
    return { ok: true, id: created.id, version, note: `Imported version ${version}.${flagged ? ` ${flagged} line(s) use words the style guard watches for; that's fine in master.` : ""}` };
  } catch (e) {
    return fail(e);
  }
}

async function latestMaster() {
  const master = await db.resumeMaster.findFirst({ orderBy: { version: "desc" } });
  if (!master) throw new Error("Import your master résumé first (Jobs → Résumé).");
  return { id: master.id, data: resumeSchema.parse(master.data) as Resume };
}

async function nextVersion(postingId: string): Promise<number> {
  const last = await db.tailoredResume.findFirst({ where: { postingId }, orderBy: { version: "desc" }, select: { version: true } });
  return (last?.version ?? 0) + 1;
}

/** Generate a new tailored version with Claude, or with the no-AI quick tailor. */
export async function generateTailored(postingId: string, mode: "claude" | "quick"): Promise<TailorResult> {
  try {
    await requireAuth();
    const [posting, master] = await Promise.all([
      db.jobPosting.findUniqueOrThrow({ where: { id: postingId }, include: { company: { select: { name: true } } } }),
      latestMaster(),
    ]);
    const input = {
      title: posting.title,
      companyName: posting.company.name,
      lane: posting.lane as Lane,
      descriptionText: posting.descriptionText,
    };
    const doc =
      mode === "quick"
        ? quickTailor(master.data, input)
        : await tailorWithClaude({ master: master.data, posting: input, tailoringNotes: posting.tailoringNotes });
    const version = await nextVersion(postingId);
    const created = await db.tailoredResume.create({
      data: { postingId, masterId: master.id, version, data: doc as unknown as Prisma.InputJsonValue, coverNote: doc.coverNote || null },
    });
    revalidatePath(`/jobs/${postingId}/tailor`);
    return { ok: true, id: created.id, version };
  } catch (e) {
    return fail(e);
  }
}

const docSchema = z.object({
  headline: z.string().max(200),
  summary: z.string().max(2000),
  experience: z.array(
    z.object({
      id: z.string(),
      omitted: z.boolean().optional(),
      bullets: z.array(z.object({ id: z.string(), text: z.string().max(1200), status: z.enum(["pending", "accepted", "edited", "rejected"]) })),
    })
  ),
  skillGroupOrder: z.array(z.string()),
  coverNote: z.string().max(5000),
  rationale: z.string().max(2000),
  generatedBy: z.enum(["claude", "quick"]),
});

/** Every save is a new version; earlier versions (and sent ones) never change. */
export async function saveTailoredVersion(postingId: string, fromId: string, doc: TailoredDoc): Promise<TailorResult> {
  try {
    await requireAuth();
    const parsed = docSchema.parse(doc) as TailoredDoc;
    const from = await db.tailoredResume.findUniqueOrThrow({ where: { id: fromId } });
    if (from.postingId !== postingId) throw new Error("Version belongs to another job.");
    const version = await nextVersion(postingId);
    const created = await db.tailoredResume.create({
      data: {
        postingId,
        masterId: from.masterId,
        version,
        data: parsed as unknown as Prisma.InputJsonValue,
        coverNote: parsed.coverNote || null,
        decisions: Object.fromEntries(parsed.experience.flatMap((r) => r.bullets.map((b) => [b.id, b.status]))),
      },
    });
    revalidatePath(`/jobs/${postingId}/tailor`);
    return { ok: true, id: created.id, version };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Record that this exact version was sent. Refused while it has blocking
 * truth/style issues. The owner applies on the employer's site; this only
 * records it.
 */
export async function markAppliedWithVersion(postingId: string, tailoredId: string): Promise<TailorResult> {
  try {
    await requireAuth();
    const t = await db.tailoredResume.findUniqueOrThrow({ where: { id: tailoredId }, include: { master: true } });
    if (t.postingId !== postingId) throw new Error("Version belongs to another job.");
    const master = resumeSchema.parse(t.master.data) as Resume;
    const doc = t.data as unknown as TailoredDoc;
    if (hasBlocking(checkTruth(master, doc), checkDocStyle(master, doc))) {
      return { ok: false, error: "This version still has blocking issues. Fix them and save first." };
    }
    const posting = await db.jobPosting.findUniqueOrThrow({ where: { id: postingId }, select: { status: true, appliedAt: true } });
    const now = new Date();
    const next = defaultNextAction("APPLIED", now);
    await db.$transaction([
      db.jobPosting.update({
        where: { id: postingId },
        data: {
          status: "APPLIED",
          statusChangedAt: now,
          appliedAt: posting.appliedAt ?? now,
          appliedResumeId: tailoredId,
          nextActionNote: next?.note ?? null,
          nextActionDue: next?.due ?? null,
          archivedAt: null,
        },
      }),
      db.jobActivity.create({
        data: { postingId, kind: "STATUS_CHANGE", fromStatus: posting.status, toStatus: "APPLIED", occurredAt: now, note: `Sent tailored résumé v${t.version}` },
      }),
    ]);
    revalidatePath(`/jobs/${postingId}`);
    revalidatePath(`/jobs/${postingId}/tailor`);
    revalidatePath("/jobs");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
