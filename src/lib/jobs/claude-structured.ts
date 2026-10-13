import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

/**
 * One structured-output call to Claude, shared by every job-finder feature.
 *
 * - Streams, so a generous output budget doesn't run into HTTP timeouts.
 *   Thinking counts toward max_tokens, so 16K could cut a long evaluation off
 *   mid-JSON ("Unterminated string in JSON").
 * - Checks why Claude stopped before reading the JSON: a refusal or a cut-off
 *   reply becomes a clear message instead of a parse error.
 * - Server-side fallback on refusals, as before.
 */

/** Room for thinking plus the longest answer (the evaluator's report). */
export const STRUCTURED_MAX_TOKENS = 64_000;

/** What a caller can show while Claude works: its reasoning summary, then how much of the answer is written. */
export type ClaudeProgress = { type: "thinking"; text: string } | { type: "writing"; chars: number };

export class ClaudeRefusedError extends Error {}
export class ClaudeIncompleteError extends Error {}

export async function claudeStructured<S extends z.ZodType>(
  schema: S,
  req: {
    model: string;
    effort: "low" | "medium" | "high" | "xhigh" | "max";
    system: string | Anthropic.Beta.BetaTextBlockParam[];
    messages: Anthropic.Beta.BetaMessageParam[];
  },
  errors: { refused: string; incomplete: string },
  onProgress?: (p: ClaudeProgress) => void
): Promise<z.infer<S>> {
  // Sent as a plain JSON schema; parsed here, after the stop reason is checked.
  const { parse, ...format } = betaZodOutputFormat(schema);
  const client = new Anthropic();
  const stream = client.beta.messages.stream({
    model: req.model,
    max_tokens: STRUCTURED_MAX_TOKENS,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    // A readable summary of the reasoning only when someone is watching; it's billed the same either way.
    ...(onProgress ? { thinking: { type: "adaptive" as const, display: "summarized" as const } } : {}),
    output_config: { effort: req.effort, format },
    system: req.system,
    messages: req.messages,
  });
  if (onProgress) {
    stream.on("thinking", (delta) => delta && onProgress({ type: "thinking", text: delta }));
    stream.on("text", (_delta, snapshot) => onProgress({ type: "writing", chars: snapshot.length }));
  }
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") throw new ClaudeRefusedError(errors.refused);
  if (message.stop_reason === "max_tokens") throw new ClaudeIncompleteError(errors.incomplete);
  const text = message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    return parse(text) as z.infer<S>;
  } catch {
    throw new ClaudeIncompleteError(errors.incomplete);
  }
}
