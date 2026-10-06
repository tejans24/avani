import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";

import { assertNoPersonalData, buildTailoringPayload, guardedContact, scrubPersonal, serializeForAiParts } from "@/lib/jobs/ai-payload";
import type { FitAnalysis } from "@/lib/jobs/fit";
import type { Resume } from "@/lib/jobs/resume-schema";
import { styleRulesForPrompt } from "@/lib/jobs/resume-style";
import { FEDERAL_VOCABULARY_LANES, maxResumePages, type Lane } from "@/lib/jobs/scoring-config";
import {
  docForChat,
  docFromOutput,
  quickTailor,
  tailorChatOutputSchema,
  tailorOutputSchema,
  type TailorChatOutput,
  type TailoredDoc,
} from "@/lib/jobs/tailor";

/**
 * Claude-backed tailoring, and the chat that edits a tailored version.
 *
 * Privacy: the request body is built exclusively by serializeForAiParts
 * (allowlisted résumé content + the posting, personal details scrubbed and
 * re-checked; the call is refused if anything personal remains).
 * Truthfulness and style are checked again in code on the result
 * (tailor.ts / resume-style.ts); the prompt asks for the same rules.
 *
 * TAILOR_MODE=fake (tests) returns the no-AI quick tailor instead.
 */

export const TAILOR_MODEL = "claude-opus-5-5";

const SYSTEM = `You tailor one candidate's résumé to one job posting, and write a short cover note.

You receive the candidate's master résumé content (personal details removed) and the posting.
Return your choices in the required JSON format.

Truthfulness is the hard rule:
- Use only facts from the master résumé and its stories. Never add a number, tool, employer, client, outcome, title or responsibility that isn't there.
- Rewording is allowed only when the meaning stays the same: change emphasis, order and vocabulary toward the posting. If a bullet already fits, return its master text unchanged. Prefer the candidate's own words.
- Never name a client or employer beyond what the master résumé already names.
- The headline must be exactly the master headline or one of headlineOptions.

Selection:
- For each role, choose the bullets that best fit this posting, most relevant first, by bullet id. Reserve bullets (reserve: true) are true and may be used when the posting asks for that skill.
- Length is a hard limit (stated with the posting). As a budget: the three most recent roles up to 4 bullets each, the next three up to 2, older roles 0 or 1 (a role with no bullets still shows its title line). Fewer, stronger bullets beat more. The app trims anything over the page limit, cutting from older roles first.
- Order skill groups by relevance to the posting, using the exact group names.

Summary: 2 to 4 sentences, using only master facts, in the posting's vocabulary where it is honest to do so.
Cover note: 4 to 6 sentences, first person, plain and specific: why this role, the two or three most relevant things the candidate has actually done, and one line on how they work. No greeting or sign-off; the candidate adds those.
Rationale: one or two sentences for the candidate on what you emphasized and why.

Style (the result is checked in code and rejected if it breaks these):
${styleRulesForPrompt()}`;

const FEDERAL = `This is a government-contractor role. Where the master content supports it, use federal vocabulary (mission, program, agency, stakeholders, compliance, modernization, period of performance) without adding facts.`;

export class TailorRefusedError extends Error {}

/** The evaluation's tailoring plan, as advice the rules still win over. */
export function fitPlanText(plan: FitAnalysis["tailoring"]): string | null {
  if (!plan) return null;
  const list = (label: string, items: string[]) => (items.length ? `${label}: ${items.join("; ")}` : "");
  return [
    "Tailoring plan from the evaluation of this posting (advice; the truthfulness rules and the approved headlines still apply):",
    `Header suggestion: ${plan.header}`,
    `Summary: ${plan.summary}`,
    list("Skills to lead with", plan.skillsLead),
    list("Posting keywords to add (only with a bullet behind them)", plan.skillsAdd),
    list("Skills to cut", plan.skillsCut),
    list("Bullets", plan.bullets),
    list("Honesty flags", plan.honestyFlags),
  ]
    .filter(Boolean)
    .join("\n");
}

export async function tailorWithClaude(input: {
  master: Resume;
  posting: { title: string; companyName: string; lane: Lane; descriptionText: string };
  tailoringNotes: string | null;
  fitPlan?: FitAnalysis["tailoring"];
}): Promise<TailoredDoc> {
  if (process.env.TAILOR_MODE === "fake") return quickTailor(input.master, input.posting);
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Set ANTHROPIC_API_KEY to tailor with Claude, or use Quick tailor.");

  const payload = buildTailoringPayload({
    master: input.master,
    posting: { title: input.posting.title, company: input.posting.companyName, lane: input.posting.lane, description: input.posting.descriptionText },
    tailoringNotes: input.tailoringNotes,
  });
  const parts = serializeForAiParts(payload, guardedContact(input.master));
  const federal = FEDERAL_VOCABULARY_LANES.includes(input.posting.lane);
  const planRaw = fitPlanText(input.fitPlan ?? null);
  const plan = planRaw ? scrubPersonal(planRaw, guardedContact(input.master)) : null;
  if (plan) assertNoPersonalData(plan, guardedContact(input.master));

  const client = new Anthropic();
  const response = await client.beta.messages.parse({
    model: TAILOR_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "high", format: betaZodOutputFormat(tailorOutputSchema) },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [
          // Identical for every posting: cached after the first tailoring run.
          { type: "text", text: `Master résumé content:\n${parts.resume}`, cache_control: { type: "ephemeral" } },
          { type: "text", text: `Length: the finished résumé must fit ${maxResumePages(input.posting.lane)} pages; choose fewer bullets in older roles to get there.\n\n${federal ? FEDERAL + "\n\n" : ""}${plan ? plan + "\n\n" : ""}Posting and the candidate's notes for it:\n${parts.posting}` },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new TailorRefusedError("Claude declined to tailor this posting. Use Quick tailor or edit by hand.");
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new Error("Tailoring came back incomplete. Try again.");
  }
  return docFromOutput(input.master, response.parsed_output, "claude");
}

// --- Chat ----------------------------------------------------------------------

const CHAT_SYSTEM = `You help one candidate adjust a résumé already tailored to one job posting. You see their master résumé content (personal details removed), the posting, the current version, and the conversation.

Answer plainly and briefly. When they ask for a change, make it as edits on the current version; when they ask a question, answer it and return no edits.

Truthfulness is the hard rule, and every edit is checked in code:
- Use only facts from the master résumé and its stories. Never add a number, tool, employer, client, outcome, title or responsibility that isn't there. If they ask for something the master doesn't support, say so, make no edit for it, and tell them what to add to the master résumé instead.
- Rewording keeps the meaning. Prefer the candidate's own words; use the posting's vocabulary only where it's honest.
- Bullets are referenced by id and must belong to that role in the master. ADD_BULLET brings a master bullet (including reserve bullets) back in by id; its text is the master text.
- Headlines must be the master headline or one of headlineOptions, exactly.
- Leaving a role out (OMIT_ROLE) is allowed; mention when it would leave a visible gap in the dates.

Edits: op, roleId, bulletId, text, position (0-based, -1 for the end), skillGroups, and why (one short line). Fill fields an op doesn't use with "" / -1 / [].

Style (checked in code):
${styleRulesForPrompt()}`;

export type ChatTurn = { role: "user" | "assistant"; text: string };

export async function chatAboutResumeWithClaude(input: {
  master: Resume;
  posting: { title: string; companyName: string; lane: Lane; descriptionText: string };
  doc: TailoredDoc;
  history: ChatTurn[];
  message: string;
  fitPlan?: FitAnalysis["tailoring"];
}): Promise<TailorChatOutput> {
  if (process.env.TAILOR_MODE === "fake") return fakeChat(input.master, input.message);
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Set ANTHROPIC_API_KEY to chat with Claude about your résumé.");

  const contact = guardedContact(input.master);
  const s = (t: string) => scrubPersonal(t, contact);
  const payload = buildTailoringPayload({
    master: input.master,
    posting: { title: input.posting.title, company: input.posting.companyName, lane: input.posting.lane, description: input.posting.descriptionText },
  });
  const parts = serializeForAiParts(payload, contact);
  const current = s(JSON.stringify(docForChat(input.master, input.doc)));
  const plan = fitPlanText(input.fitPlan ?? null);
  const context = `${plan ? s(plan) + "\n\n" : ""}Posting:\n${parts.posting}\n\nCurrent version:\n${current}`;
  // Only the last 20 turns; every one scrubbed like the rest.
  const turns = [...input.history.slice(-20), { role: "user" as const, text: input.message }].map((t) => ({ role: t.role, text: s(t.text) }));
  for (const part of [context, ...turns.map((t) => t.text)]) assertNoPersonalData(part, contact);

  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  turns.forEach((t, i) => {
    if (i === 0) {
      // The first user turn carries the résumé (cached) and the job context.
      const first: Anthropic.Beta.BetaContentBlockParam[] = [
        { type: "text", text: `Master résumé content:\n${parts.resume}`, cache_control: { type: "ephemeral" } },
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
    model: TAILOR_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(tailorChatOutputSchema) },
    system: [{ type: "text", text: CHAT_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages,
  });
  if (response.stop_reason === "refusal") throw new TailorRefusedError("Claude declined that request. Edit by hand instead.");
  if (response.stop_reason === "max_tokens" || !response.parsed_output) throw new Error("The reply came back incomplete. Try again.");
  return response.parsed_output;
}

/** TAILOR_MODE=fake (tests): "leave out <roleId>" omits that role; anything else gets an echo and no edits. */
function fakeChat(master: Resume, message: string): TailorChatOutput {
  const role = master.experience.find((e) => new RegExp(`leave out ${e.id}\\b`, "i").test(message));
  if (role) {
    return {
      reply: `Left out ${role.title} at ${role.organization}.`,
      edits: [{ op: "OMIT_ROLE", roleId: role.id, bulletId: "", text: "", position: -1, skillGroups: [], why: `Leave out ${role.organization}` }],
    };
  }
  return { reply: `Fake reply: ${message}`, edits: [] };
}
