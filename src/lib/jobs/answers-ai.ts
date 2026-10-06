import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";

import { assertNoPersonalData, buildTailoringPayload, scrubPersonal, serializeForAiParts } from "@/lib/jobs/ai-payload";
import { draftedAnswersSchema, jobChatOutputSchema, type DraftedAnswers, type JobChatOutput } from "@/lib/jobs/answers";
import type { FitAnalysis } from "@/lib/jobs/fit";
import { fitSystemPrompt } from "@/lib/jobs/fit-prompt";
import { styleRulesForPrompt } from "@/lib/jobs/resume-style";
import type { Resume } from "@/lib/jobs/resume-schema";
import type { Lane } from "@/lib/jobs/scoring-config";

/**
 * Claude on the job page: drafting application answers, and a chat about the
 * posting. Same privacy boundary as tailoring: the résumé goes through the
 * allowlist, every other part (the evaluation, the questions, chat messages
 * and history) is scrubbed of contact details and checked before sending.
 * Personal questions never get here: answers.ts answers them in the app.
 *
 * TAILOR_MODE=fake (tests) returns deterministic stand-ins.
 */

export const ANSWERS_MODEL = "claude-opus-5-5";

/** The criteria section of the owner's evaluator prompt, for context. */
function criteriaText(): string {
  const p = fitSystemPrompt();
  const start = p.indexOf("Candidate criteria");
  const end = p.indexOf("Your process");
  return start >= 0 && end > start ? p.slice(start, end).trim() : "";
}

const RULES = `Truthfulness is the hard rule:
- Use only facts from the candidate's résumé content and stories. Never add a number, tool, employer, client, outcome, title or responsibility that isn't there. If a question needs something the résumé doesn't show, say what's missing in the note instead of inventing it.
- Never write the candidate's name, contact details, or anything personal; the app fills those in.
- First person, plain and specific, in the candidate's own words where possible. Short: most answers 2 to 5 sentences unless the question asks for more.

Style:
${styleRulesForPrompt()}`;

const DRAFT_SYSTEM = `You draft answers to a job application's questions for one candidate, using their résumé content and the posting.

${RULES}

Return one answer per question, in the order given, with the question text unchanged.`;

const CHAT_SYSTEM = `You help one candidate think about one job posting: whether it fits, what the role really is, what to ask, and how to answer the application's questions. You see their criteria, their résumé content (personal details removed), the posting, and the app's evaluation if there is one.

Answer plainly and briefly, like an experienced friend who has read the posting the way the hiring manager will. Name conflicts with their criteria directly.

When they ask you to answer or draft application questions, put each one in answers (question as asked, the drafted answer, and a note on anything to confirm). Otherwise answers is empty.

${RULES}`;

export type JobChatTurn = { role: "user" | "assistant"; text: string };

type Ctx = {
  master: Resume;
  posting: { title: string; companyName: string; lane: Lane; descriptionText: string };
  fit: FitAnalysis | null;
};

/** The parts every request shares, built and checked once. */
function requestParts(ctx: Ctx) {
  const contact = ctx.master.contact;
  const payload = buildTailoringPayload({
    master: ctx.master,
    posting: { title: ctx.posting.title, company: ctx.posting.companyName, lane: ctx.posting.lane, description: ctx.posting.descriptionText },
  });
  const parts = serializeForAiParts(payload, contact);
  const evaluation = ctx.fit
    ? scrubPersonal(
        JSON.stringify({
          verdict: ctx.fit.verdict,
          reason: ctx.fit.reason,
          realJob: ctx.fit.realJob,
          gates: ctx.fit.gates,
          criteria: ctx.fit.criteria,
          pay: ctx.fit.pay,
        }),
        contact
      )
    : "";
  const criteria = criteriaText();
  for (const part of [evaluation, criteria]) assertNoPersonalData(part, contact);
  return { parts, evaluation, criteria, contact };
}

export async function draftAnswersWithClaude(ctx: Ctx & { questions: string[] }): Promise<DraftedAnswers> {
  if (process.env.TAILOR_MODE === "fake") {
    return { answers: ctx.questions.map((q) => ({ question: q, answer: `Fake draft for: ${q}`, note: "" })) };
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Set ANTHROPIC_API_KEY to draft answers with Claude.");
  const { parts, evaluation, contact } = requestParts(ctx);
  const questions = scrubPersonal(ctx.questions.map((q, i) => `${i + 1}. ${q}`).join("\n"), contact);
  assertNoPersonalData(questions, contact);

  const client = new Anthropic();
  const response = await client.beta.messages.parse({
    model: ANSWERS_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(draftedAnswersSchema) },
    system: [{ type: "text", text: DRAFT_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: `Résumé content:\n${parts.resume}`, cache_control: { type: "ephemeral" } },
          { type: "text", text: `Posting:\n${parts.posting}${evaluation ? `\n\nThe app's evaluation of this posting:\n${evaluation}` : ""}\n\nQuestions:\n${questions}` },
        ],
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("Claude declined to draft these answers.");
  if (response.stop_reason === "max_tokens" || !response.parsed_output) throw new Error("The drafts came back incomplete. Try fewer questions at once.");
  return response.parsed_output;
}

export async function jobChatWithClaude(ctx: Ctx & { history: JobChatTurn[]; message: string }): Promise<JobChatOutput> {
  if (process.env.TAILOR_MODE === "fake") {
    const draft = ctx.message.match(/^draft:\s*(.+)$/i)?.[1];
    return draft
      ? { reply: "Here's a draft.", answers: [{ question: draft, answer: `Fake draft for: ${draft}`, note: "" }] }
      : { reply: `Fake reply: ${ctx.message}`, answers: [] };
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Set ANTHROPIC_API_KEY to chat with Claude about this job.");
  const { parts, evaluation, criteria, contact } = requestParts(ctx);
  const turns = [...ctx.history.slice(-20), { role: "user" as const, text: ctx.message }].map((t) => ({ role: t.role, text: scrubPersonal(t.text, contact) }));
  for (const t of turns) assertNoPersonalData(t.text, contact);

  const context = `${criteria}\n\nPosting:\n${parts.posting}${evaluation ? `\n\nThe app's evaluation of this posting:\n${evaluation}` : ""}`;
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  turns.forEach((t, i) => {
    if (i === 0) {
      const first: Anthropic.Beta.BetaContentBlockParam[] = [
        { type: "text", text: `Résumé content:\n${parts.resume}`, cache_control: { type: "ephemeral" } },
        { type: "text", text: context },
      ];
      if (t.role === "user") messages.push({ role: "user", content: [...first, { type: "text", text: t.text }] });
      else messages.push({ role: "user", content: first }, { role: "assistant", content: t.text });
      return;
    }
    messages.push({ role: t.role, content: t.text });
  });

  const client = new Anthropic();
  const response = await client.beta.messages.parse({
    model: ANSWERS_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(jobChatOutputSchema) },
    system: [{ type: "text", text: CHAT_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages,
  });
  if (response.stop_reason === "refusal") throw new Error("Claude declined that request.");
  if (response.stop_reason === "max_tokens" || !response.parsed_output) throw new Error("The reply came back incomplete. Try again.");
  return response.parsed_output;
}
