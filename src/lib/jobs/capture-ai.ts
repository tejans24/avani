import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import { scrubPersonal, type Contact } from "@/lib/jobs/ai-payload";

/**
 * Claude-assisted capture: when a job page has no structured job data
 * (JSON-LD), read title, company, location, pay and a clean description out
 * of the page text. Runs on the server (the API key never reaches the
 * browser). The owner still reviews every field before saving.
 *
 * Guards, in code:
 *   - the owner's personal details are scrubbed from the page text first
 *     (a logged-in page can include their name)
 *   - the description must be drawn from the page's own words, and the title
 *     must appear on the page; otherwise it is flagged, not trusted
 *
 * TAILOR_MODE=fake (tests) returns a simple heuristic instead of calling Claude.
 */

export const CAPTURE_MODEL = "claude-opus-5-5";

export const captureExtractSchema = z.object({
  isJobPosting: z.boolean(),
  title: z.string(),
  companyName: z.string(),
  location: z.string(),
  workMode: z.enum(["REMOTE", "HYBRID", "ONSITE", "UNKNOWN"]),
  /** Annual USD, whole dollars; 0 when the page states no pay. */
  payMin: z.number(),
  payMax: z.number(),
  /** YYYY-MM-DD, or "" when the page doesn't say. */
  postedOn: z.string(),
  /** The posting's own text (responsibilities, requirements, benefits), page chrome removed. */
  descriptionText: z.string(),
});
export type CaptureExtract = z.infer<typeof captureExtractSchema>;

export type ExtractResult = {
  fields: CaptureExtract;
  /** Things the owner should double-check. */
  warnings: string[];
};

const SYSTEM = `You extract one job posting from the text of a careers web page.
Return the posting's title, hiring company, location, work arrangement, posted pay range (annual US dollars; convert hourly at 2080 hours; 0 if not stated), posted date (YYYY-MM-DD, or empty), and the description.
For the description, copy the posting's own sentences (responsibilities, requirements, qualifications, benefits, pay) and leave out navigation, cookie banners, "similar jobs", and footer text. Do not summarize, reword, or add anything.
If the page is not a single job posting, set isJobPosting to false.`;

const WORD = /[a-z0-9][a-z0-9+#.%$-]*/g;

/** Share of the description's words that appear in the page text. */
export function groundedShare(description: string, pageText: string): number {
  const page = new Set(pageText.toLowerCase().match(WORD) ?? []);
  const words = description.toLowerCase().match(WORD) ?? [];
  if (!words.length) return 0;
  return words.filter((w) => page.has(w)).length / words.length;
}

/** Code-side checks on an extraction (pure, unit-tested). */
export function checkExtract(fields: CaptureExtract, pageText: string): string[] {
  const warnings: string[] = [];
  if (!fields.isJobPosting) warnings.push("This page doesn't look like a single job posting.");
  if (fields.title && !pageText.toLowerCase().includes(fields.title.toLowerCase().slice(0, 40))) {
    warnings.push("The title isn't on the page as written. Check it.");
  }
  if (fields.descriptionText && groundedShare(fields.descriptionText, pageText) < 0.9) {
    warnings.push("Part of the description isn't from the page. The page's own text was used instead.");
  }
  if (fields.payMin && fields.payMax && fields.payMin > fields.payMax) warnings.push("Pay range looks reversed. Check it.");
  return warnings;
}

function heuristic(pageTitle: string | undefined, text: string): CaptureExtract {
  const [title = "", company = ""] = (pageTitle ?? "").split(/\s[|–-]\s/).map((s) => s.trim());
  return {
    isJobPosting: true,
    title,
    companyName: company,
    location: /\bremote\b/i.test(text) ? "Remote" : "",
    workMode: /\bremote\b/i.test(text) ? "REMOTE" : "UNKNOWN",
    payMin: 0,
    payMax: 0,
    postedOn: "",
    descriptionText: text.trim(),
  };
}

export async function extractJobWithClaude(input: { pageTitle?: string; text: string; contact: Contact | null }): Promise<ExtractResult> {
  const text = input.contact ? scrubPersonal(input.text, input.contact) : input.text;
  const pageTitle = input.contact && input.pageTitle ? scrubPersonal(input.pageTitle, input.contact) : input.pageTitle;

  let fields: CaptureExtract;
  if (process.env.TAILOR_MODE === "fake") {
    fields = heuristic(pageTitle, text);
  } else {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("Set ANTHROPIC_API_KEY to fill details with Claude.");
    const client = new Anthropic();
    const response = await client.beta.messages.parse({
      model: CAPTURE_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(captureExtractSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: `Page title: ${pageTitle ?? "(none)"}\n\nPage text:\n${text}` }],
    });
    if (response.stop_reason === "refusal") throw new Error("Claude declined to read this page. Fill the fields by hand.");
    if (response.stop_reason === "max_tokens" || !response.parsed_output) throw new Error("Couldn't read the page fully. Try again or fill by hand.");
    fields = response.parsed_output;
  }

  const warnings = checkExtract(fields, text);
  // An ungrounded description is never trusted: fall back to the page's own text.
  if (fields.descriptionText && groundedShare(fields.descriptionText, text) < 0.9) fields = { ...fields, descriptionText: text.trim() };
  return { fields, warnings };
}
