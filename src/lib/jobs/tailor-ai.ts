import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";

import { buildTailoringPayload, serializeForAiParts } from "@/lib/jobs/ai-payload";
import type { Resume } from "@/lib/jobs/resume-schema";
import { styleRulesForPrompt } from "@/lib/jobs/resume-style";
import { FEDERAL_VOCABULARY_LANES, type Lane } from "@/lib/jobs/scoring-config";
import { docFromOutput, quickTailor, tailorOutputSchema, type TailoredDoc } from "@/lib/jobs/tailor";

/**
 * Claude-backed tailoring. The only place the job finder calls an AI model.
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
- For each role, choose the bullets that best fit this posting, most relevant first, by bullet id. Recent roles: usually 3 to 6 bullets. Older roles: 1 or 2. Reserve bullets (reserve: true) are true and may be used when the posting asks for that skill.
- Order skill groups by relevance to the posting, using the exact group names.

Summary: 2 to 4 sentences, using only master facts, in the posting's vocabulary where it is honest to do so.
Cover note: 4 to 6 sentences, first person, plain and specific: why this role, the two or three most relevant things the candidate has actually done, and one line on how they work. No greeting or sign-off; the candidate adds those.
Rationale: one or two sentences for the candidate on what you emphasized and why.

Style (the result is checked in code and rejected if it breaks these):
${styleRulesForPrompt()}`;

const FEDERAL = `This is a government-contractor role. Where the master content supports it, use federal vocabulary (mission, program, agency, stakeholders, compliance, modernization, period of performance) without adding facts.`;

export class TailorRefusedError extends Error {}

export async function tailorWithClaude(input: {
  master: Resume;
  posting: { title: string; companyName: string; lane: Lane; descriptionText: string };
  tailoringNotes: string | null;
}): Promise<TailoredDoc> {
  if (process.env.TAILOR_MODE === "fake") return quickTailor(input.master, input.posting);
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Set ANTHROPIC_API_KEY to tailor with Claude, or use Quick tailor.");

  const payload = buildTailoringPayload({
    master: input.master,
    posting: { title: input.posting.title, company: input.posting.companyName, lane: input.posting.lane, description: input.posting.descriptionText },
    tailoringNotes: input.tailoringNotes,
  });
  const parts = serializeForAiParts(payload, input.master.contact);
  const federal = FEDERAL_VOCABULARY_LANES.includes(input.posting.lane);

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
          { type: "text", text: `${federal ? FEDERAL + "\n\n" : ""}Posting and the candidate's notes for it:\n${parts.posting}` },
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
