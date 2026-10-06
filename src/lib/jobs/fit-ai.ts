import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";

import { assertNoPersonalData, buildTailoringPayload, guardedContact, scrubPersonal, serializeForAiParts } from "@/lib/jobs/ai-payload";
import { codeChecks, codeChecksForPrompt, fakeFitOutput, finalizeFit, fitOutputSchema, postingMetadata, type FitAnalysis, type FitPostingFacts } from "@/lib/jobs/fit";
import { fitSystemPrompt } from "@/lib/jobs/fit-prompt";
import type { Resume } from "@/lib/jobs/resume-schema";
import type { BreakdownEntry } from "@/lib/jobs/scoring";
import type { Lane } from "@/lib/jobs/scoring-config";

/**
 * The job posting evaluator, run by Claude. Privacy matches tailoring: the
 * résumé goes through buildTailoringPayload/serializeForAiParts (allowlisted
 * content, personal details scrubbed, the call refused if any remain), and
 * every other part of the request is checked the same way. The commute is
 * checked in code (fit.ts), so the home city is never part of the request.
 *
 * TAILOR_MODE=fake (tests) returns a deterministic stand-in.
 */

export const FIT_MODEL = "claude-opus-5-5";

export async function analyzeFitWithClaude(input: {
  master: Resume;
  posting: FitPostingFacts & { lane: Lane; tailoringNotes: string | null };
  breakdown: BreakdownEntry[];
  now: Date;
}): Promise<FitAnalysis> {
  const bulletIds = new Set(
    [...input.master.experience.flatMap((e) => e.bullets), ...input.master.projects.flatMap((p) => p.bullets)].map((b) => b.id)
  );
  const ctx = { posting: input.posting, bulletIds, now: input.now };

  if (process.env.TAILOR_MODE === "fake") {
    return finalizeFit(fakeFitOutput(input.posting, input.breakdown, [...bulletIds]), { ...ctx, model: "fake" });
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Set ANTHROPIC_API_KEY to evaluate jobs with Claude.");

  const contact = guardedContact(input.master);
  const payload = buildTailoringPayload({
    master: input.master,
    posting: { title: input.posting.title, company: input.posting.companyName, lane: input.posting.lane, description: input.posting.descriptionText },
    tailoringNotes: input.posting.tailoringNotes,
  });
  const parts = serializeForAiParts(payload, contact);
  const system = fitSystemPrompt();
  const checked = scrubPersonal(codeChecksForPrompt(codeChecks(input.posting)), contact);
  const metadata = scrubPersonal(postingMetadata(input.posting), contact);
  for (const part of [system, checked, metadata]) assertNoPersonalData(part, contact);

  const client = new Anthropic();
  const response = await client.beta.messages.parse({
    model: FIT_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "high", format: betaZodOutputFormat(fitOutputSchema) },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [
          // The same for every posting: cached after the first run.
          { type: "text", text: `CANDIDATE_PROFILE:\n${parts.resume}`, cache_control: { type: "ephemeral" } },
          { type: "text", text: `${checked}\n\nPOSTING metadata:\n${metadata}\n\nPOSTING:\n${parts.posting}` },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new Error("Claude declined to evaluate this posting.");
  if (response.stop_reason === "max_tokens" || !response.parsed_output) throw new Error("The evaluation came back incomplete. Try again.");
  return finalizeFit(response.parsed_output, { ...ctx, model: FIT_MODEL });
}
