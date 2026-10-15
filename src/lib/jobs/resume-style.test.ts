import { describe, expect, it } from "vitest";

import { checkStyle, hasBlockingIssues, styleRulesForPrompt } from "@/lib/jobs/resume-style";

const rules = (text: string, baseline?: string) => checkStyle(text, baseline).map((i) => `${i.severity}:${i.rule}:${i.match}`);

describe("checkStyle", () => {
  it("blocks em dashes and double hyphens", () => {
    const issues = checkStyle("Built the claims API — on AWS -- in six weeks.");
    expect(issues.map((i) => i.match)).toEqual(["—", "--"]);
    expect(hasBlockingIssues(issues)).toBe(true);
  });

  it("allows hyphens and en-dash date ranges", () => {
    expect(checkStyle("Event-driven intake pipeline, 2021–2024.")).toEqual([]);
  });

  it("flags AI-tell vocabulary as warnings, not blocks", () => {
    const issues = checkStyle("Spearheaded a robust, seamless migration.");
    expect(issues.map((i) => i.match)).toEqual(["Spearheaded", "robust", "seamless"]);
    expect(hasBlockingIssues(issues)).toBe(false);
  });

  it("does not flag a phrase the owner already uses in master", () => {
    expect(rules("Designed a robust retry layer.", "Designed a robust retry layer for claims.")).toEqual([]);
  });

  it("matches whole words only", () => {
    // "dynamic" must not fire inside "DynamoDB" or "dynamically-typed", nor "unlock" inside "unlocked".
    expect(rules("Tuned DynamoDB and dynamically-typed handlers; unlocked accounts.")).toEqual([]);
  });

  it("flags 'not only … but also' and trailing participle clauses", () => {
    expect(rules("Not only cut latency but also reduced cost.")).toEqual([
      "warn:not-only-but-also:Not only cut latency but also",
    ]);
    expect(rules("Rebuilt the eligibility service, ensuring 99.9% uptime.")).toEqual([
      "warn:participle-tail:, ensuring 99.9% uptime.",
    ]);
  });

  it("passes plain, specific writing", () => {
    expect(checkStyle("Moved 40 batch jobs to Step Functions and cut nightly runtime from 6 hours to 50 minutes.")).toEqual([]);
  });
});

describe("styleRulesForPrompt", () => {
  it("tells the model about em dashes and the phrase list", () => {
    const p = styleRulesForPrompt();
    expect(p).toContain("Never use em dashes");
    expect(p).toContain("spearheaded");
  });
});
