"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { classifyQuestion, isLocalKind, localAnswer, mergeAnswers, parseQuestions, type ApplicationAnswer } from "@/lib/jobs/answers";
import { draftAnswersWithClaude, jobChatWithClaude, type JobChatTurn } from "@/lib/jobs/answers-ai";
import type { FitAnalysis } from "@/lib/jobs/fit";
import { resumeSchema, type Resume } from "@/lib/jobs/resume-schema";
import type { Lane } from "@/lib/jobs/scoring-config";

export type AnswersResult = { ok: true; answers: ApplicationAnswer[]; note?: string } | { ok: false; error: string };

const fail = (e: unknown) => ({
  ok: false as const,
  error: e instanceof z.ZodError ? (e.issues[0]?.message ?? "Invalid input") : e instanceof Error ? e.message : "Something went wrong",
});

async function load(postingId: string) {
  const [posting, master] = await Promise.all([
    db.jobPosting.findUniqueOrThrow({ where: { id: postingId }, include: { company: { select: { name: true } } } }),
    db.resumeMaster.findFirst({ orderBy: { version: "desc" }, select: { data: true } }),
  ]);
  if (!master) throw new Error("Import your master résumé first (Jobs → Résumé).");
  const fit = posting.fitAnalysis as unknown as FitAnalysis | null;
  return {
    posting,
    master: resumeSchema.parse(master.data) as Resume,
    fit,
    ctx: { title: posting.title, companyName: posting.company.name, lane: posting.lane as Lane, descriptionText: posting.descriptionText },
    answers: (posting.applicationAnswers ?? []) as unknown as ApplicationAnswer[],
  };
}

async function store(postingId: string, answers: ApplicationAnswer[]) {
  await db.jobPosting.update({ where: { id: postingId }, data: { applicationAnswers: answers as unknown as Prisma.InputJsonValue } });
  revalidatePath(`/jobs/${postingId}`);
}

/**
 * Fill an application's questions: personal ones from the master résumé in
 * the app (never sent anywhere), self-identification left to the owner, the
 * rest drafted by Claude. Answers the owner wrote are never replaced.
 */
export async function fillApplicationAnswers(postingId: string, questionsText: string): Promise<AnswersResult> {
  try {
    await requireAuth();
    const questions = parseQuestions(z.string().max(20_000).parse(questionsText));
    if (!questions.length) return { ok: false, error: "Paste the application's questions, one per line." };
    if (questions.length > 40) return { ok: false, error: "That's more than 40 questions. Paste them in smaller batches." };
    const { master, fit, ctx, answers } = await load(postingId);
    const now = new Date().toISOString();

    const local: ApplicationAnswer[] = [];
    const open: string[] = [];
    for (const q of questions) {
      const kind = classifyQuestion(q);
      if (isLocalKind(kind)) {
        const a = localAnswer(master, q, kind, { payFormEntry: fit?.pay.formEntry });
        local.push({ id: randomUUID(), question: q, answer: a.answer, note: a.note, source: "app", updatedAt: now });
      } else open.push(q);
    }
    // Claude unavailable (no key, an error): the app's answers still land, and the rest say why they're empty.
    let draftError = "";
    const drafted = open.length
      ? await draftAnswersWithClaude({ master, posting: ctx, fit, questions: open }).catch((e: unknown) => {
          draftError = e instanceof Error ? e.message : "Claude couldn't draft these.";
          return { answers: [] as { question: string; answer: string; note: string }[] };
        })
      : { answers: [] };
    const fromClaude: ApplicationAnswer[] = open.map((q, i) => {
      const d = drafted.answers.find((a) => a.question.trim().toLowerCase() === q.toLowerCase()) ?? drafted.answers[i];
      return { id: randomUUID(), question: q, answer: d?.answer ?? "", note: d?.note ?? (draftError || "No draft came back. Try again."), source: "claude", updatedAt: now };
    });
    // Keep the form's order.
    const byQ = new Map([...local, ...fromClaude].map((a) => [a.question, a]));
    const merged = mergeAnswers(answers, questions.map((q) => byQ.get(q)!));
    await store(postingId, merged);
    return {
      ok: true,
      answers: merged,
      note: draftError ? `${local.length} filled by the app. Claude didn't draft the other ${open.length}: ${draftError}` : `${local.length} filled by the app, ${fromClaude.length} drafted by Claude.`,
    };
  } catch (e) {
    return fail(e);
  }
}

/** Add answers drafted in the job chat. */
export async function addApplicationAnswers(postingId: string, items: { question: string; answer: string; note: string }[]): Promise<AnswersResult> {
  try {
    await requireAuth();
    const parsed = z.array(z.object({ question: z.string().trim().min(1).max(600), answer: z.string().max(10_000), note: z.string().max(2000) })).max(40).parse(items);
    const { answers } = await load(postingId);
    const now = new Date().toISOString();
    const merged = mergeAnswers(answers, parsed.map((a) => ({ id: randomUUID(), ...a, source: "claude" as const, updatedAt: now })));
    await store(postingId, merged);
    return { ok: true, answers: merged };
  } catch (e) {
    return fail(e);
  }
}

/** The owner's edit: it becomes theirs, and later fills won't overwrite it. */
export async function saveApplicationAnswer(postingId: string, id: string, answer: string): Promise<AnswersResult> {
  try {
    await requireAuth();
    const text = z.string().max(10_000).parse(answer);
    const { answers } = await load(postingId);
    const next = answers.map((a) => (a.id === id ? { ...a, answer: text, source: "you" as const, note: "", updatedAt: new Date().toISOString() } : a));
    await store(postingId, next);
    return { ok: true, answers: next };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteApplicationAnswer(postingId: string, id: string): Promise<AnswersResult> {
  try {
    await requireAuth();
    const { answers } = await load(postingId);
    const next = answers.filter((a) => a.id !== id);
    await store(postingId, next);
    return { ok: true, answers: next };
  } catch (e) {
    return fail(e);
  }
}

type StoredTurn = JobChatTurn & { at: string };
export type JobChatResult =
  | { ok: true; reply: string; answers: { question: string; answer: string; note: string }[]; history: StoredTurn[] }
  | { ok: false; error: string };

/** One turn of the chat about this job. */
export async function chatAboutJob(postingId: string, message: string): Promise<JobChatResult> {
  try {
    await requireAuth();
    const text = z.string().trim().min(1, "Type a message").max(4000).parse(message);
    const { posting, master, fit, ctx } = await load(postingId);
    const stored = (posting.jobChat ?? []) as unknown as StoredTurn[];
    const out = await jobChatWithClaude({ master, posting: ctx, fit, history: stored.map(({ role, text }) => ({ role, text })), message: text });
    const now = new Date().toISOString();
    const history: StoredTurn[] = [...stored, { role: "user", text, at: now }, { role: "assistant", text: out.reply, at: now }];
    await db.jobPosting.update({ where: { id: postingId }, data: { jobChat: history as unknown as Prisma.InputJsonValue } });
    return { ok: true, reply: out.reply, answers: out.answers, history };
  } catch (e) {
    return fail(e);
  }
}

export async function clearJobChat(postingId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireAuth();
    await db.jobPosting.update({ where: { id: postingId }, data: { jobChat: Prisma.DbNull } });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Questions collected from an application form when the job was added.
 * Answered in the app where possible; the rest wait for "Draft with Claude".
 * No model is called here.
 */
export async function addDetectedQuestions(postingId: string, questions: string[]): Promise<AnswersResult> {
  try {
    await requireAuth();
    const qs = parseQuestions(z.array(z.string().max(600)).max(40).parse(questions).join("\n"));
    if (!qs.length) return { ok: true, answers: [] };
    const { master, fit, answers } = await load(postingId);
    const now = new Date().toISOString();
    const incoming: ApplicationAnswer[] = qs.map((q) => {
      const kind = classifyQuestion(q);
      if (!isLocalKind(kind)) return { id: randomUUID(), question: q, answer: "", note: "", source: "todo", updatedAt: now };
      const a = localAnswer(master, q, kind, { payFormEntry: fit?.pay.formEntry });
      return { id: randomUUID(), question: q, answer: a.answer, note: a.note, source: "app", updatedAt: now };
    });
    // Never replace an answer that already has text.
    const merged = mergeAnswers(answers, incoming.filter((a) => !answers.some((x) => x.question.toLowerCase() === a.question.toLowerCase() && x.answer)));
    await store(postingId, merged);
    return { ok: true, answers: merged };
  } catch (e) {
    return fail(e);
  }
}
