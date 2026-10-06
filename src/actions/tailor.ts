"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { defaultNextAction } from "@/lib/jobs/pipeline";
import { resumeSchema, type Resume } from "@/lib/jobs/resume-schema";
import { checkStyle } from "@/lib/jobs/resume-style";
import type { FitAnalysis } from "@/lib/jobs/fit";
import { checkDocStyle, checkTruth, hasBlocking, masterDoc, quickTailor, reuseDoc, type TailorEdit, type TailoredDoc } from "@/lib/jobs/tailor";
import { chatAboutResumeWithClaude, tailorWithClaude, type ChatTurn } from "@/lib/jobs/tailor-ai";
import { maxResumePages, type Lane } from "@/lib/jobs/scoring-config";
import { fitDocToPages } from "@/pdf/resume-render";

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


/**
 * Hold a generated version to the page limit: trims in code (older roles
 * first; cut bullets marked rejected so they can come back) and says what it
 * did in the version's rationale.
 */
async function fitToLimit(master: Resume, doc: TailoredDoc, lane: Lane): Promise<TailoredDoc> {
  const maxPages = maxResumePages(lane);
  const r = await fitDocToPages(master, doc, maxPages);
  if (!r.bulletsCut && !r.skillLinesHidden) return doc;
  const what = [
    r.bulletsCut ? `${r.bulletsCut} bullet${r.bulletsCut === 1 ? "" : "s"} (marked Rejected; bring any back in the editor)` : "",
    r.skillLinesHidden ? `${r.skillLinesHidden} least relevant skill line${r.skillLinesHidden === 1 ? "" : "s"}` : "",
  ]
    .filter(Boolean)
    .join(" and ");
  const note = r.fits
    ? `Trimmed ${what} to fit ${maxPages} page${maxPages === 1 ? "" : "s"}.`
    : `Trimmed ${what}, and it's still ${r.pages} pages: leave out an old role or shorten bullets.`;
  return { ...r.doc, rationale: [doc.rationale, note].filter(Boolean).join(" ") };
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
        : await tailorWithClaude({
            master: master.data,
            posting: input,
            tailoringNotes: posting.tailoringNotes,
            fitPlan: (posting.fitAnalysis as unknown as FitAnalysis | null)?.tailoring ?? null,
          });
    const fitted = await fitToLimit(master.data, doc, posting.lane as Lane);
    const version = await nextVersion(postingId);
    const created = await db.tailoredResume.create({
      data: { postingId, masterId: master.id, version, data: fitted as unknown as Prisma.InputJsonValue, coverNote: fitted.coverNote || null },
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
  skillGroupsShown: z.number().int().min(1).max(100).optional(),
  coverNote: z.string().max(5000),
  rationale: z.string().max(2000),
  generatedBy: z.enum(["claude", "quick", "master", "reuse"]),
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

/** Start this job's résumé from master as is. */
export async function startFromMaster(postingId: string): Promise<TailorResult> {
  try {
    await requireAuth();
    await db.jobPosting.findUniqueOrThrow({ where: { id: postingId }, select: { id: true } });
    const master = await latestMaster();
    const doc = masterDoc(master.data);
    const version = await nextVersion(postingId);
    const created = await db.tailoredResume.create({
      data: { postingId, masterId: master.id, version, data: doc as unknown as Prisma.InputJsonValue },
    });
    revalidatePath(`/jobs/${postingId}/tailor`);
    return { ok: true, id: created.id, version };
  } catch (e) {
    return fail(e);
  }
}

/** Start this job's résumé from a version made for another job. */
export async function reuseTailoredVersion(postingId: string, fromId: string): Promise<TailorResult> {
  try {
    await requireAuth();
    const from = await db.tailoredResume.findUniqueOrThrow({
      where: { id: fromId },
      include: { posting: { select: { title: true, company: { select: { name: true } } } } },
    });
    const master = await latestMaster();
    const target = await db.jobPosting.findUniqueOrThrow({ where: { id: postingId }, select: { lane: true } });
    const doc = await fitToLimit(
      master.data,
      reuseDoc(master.data, from.data as unknown as TailoredDoc, `v${from.version} for ${from.posting.title} at ${from.posting.company.name}`),
      target.lane as Lane
    );
    const version = await nextVersion(postingId);
    const created = await db.tailoredResume.create({
      data: { postingId, masterId: master.id, version, data: doc as unknown as Prisma.InputJsonValue },
    });
    revalidatePath(`/jobs/${postingId}/tailor`);
    return { ok: true, id: created.id, version };
  } catch (e) {
    return fail(e);
  }
}

type StoredTurn = ChatTurn & { at: string; edits?: string[] };

export type ChatResult =
  | { ok: true; reply: string; edits: TailorEdit[]; history: StoredTurn[] }
  | { ok: false; error: string };

/**
 * One chat turn about this job's résumé. Claude sees the master content and
 * the posting (personal details removed and checked, as in tailoring), the
 * version on screen and the conversation so far; it answers and may propose
 * edits, which the editor applies only when the owner says so.
 */
export async function chatAboutResume(postingId: string, doc: TailoredDoc, message: string): Promise<ChatResult> {
  try {
    await requireAuth();
    const text = z.string().trim().min(1, "Type a message").max(4000).parse(message);
    const parsedDoc = docSchema.parse(doc) as TailoredDoc;
    const [posting, master] = await Promise.all([
      db.jobPosting.findUniqueOrThrow({ where: { id: postingId }, include: { company: { select: { name: true } } } }),
      latestMaster(),
    ]);
    const history = ((posting.tailorChat ?? []) as unknown as StoredTurn[]).map(({ role, text }) => ({ role, text }));
    const out = await chatAboutResumeWithClaude({
      master: master.data,
      posting: { title: posting.title, companyName: posting.company.name, lane: posting.lane as Lane, descriptionText: posting.descriptionText },
      doc: parsedDoc,
      history,
      message: text,
      fitPlan: (posting.fitAnalysis as unknown as FitAnalysis | null)?.tailoring ?? null,
    });
    const now = new Date().toISOString();
    const stored: StoredTurn[] = [
      ...((posting.tailorChat ?? []) as unknown as StoredTurn[]),
      { role: "user", text, at: now },
      { role: "assistant", text: out.reply, at: now, edits: out.edits.map((e) => e.why || e.op) },
    ];
    await db.jobPosting.update({ where: { id: postingId }, data: { tailorChat: stored as unknown as Prisma.InputJsonValue } });
    return { ok: true, reply: out.reply, edits: out.edits, history: stored };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? (e.issues[0]?.message ?? "Invalid input") : e instanceof Error ? e.message : "Something went wrong" };
  }
}

/** Start the conversation over. */
export async function clearResumeChat(postingId: string): Promise<TailorResult> {
  try {
    await requireAuth();
    await db.jobPosting.update({ where: { id: postingId }, data: { tailorChat: Prisma.DbNull } });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
