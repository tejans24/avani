import { describe, expect, it } from "vitest";

import { matchRule, type RuleLike } from "@/lib/rules";

function rule(overrides: Partial<RuleLike> & { id: string }): RuleLike {
  return {
    field: "DESCRIPTION",
    matchType: "SUBSTRING",
    pattern: "x",
    categoryId: `cat-${overrides.id}`,
    priority: 100,
    ...overrides,
  };
}

describe("matchRule", () => {
  it("returns null when no rules match", () => {
    expect(matchRule({ description: "COFFEE SHOP" }, [])).toBeNull();
    expect(
      matchRule({ description: "COFFEE SHOP" }, [rule({ id: "a", pattern: "airline" })])
    ).toBeNull();
  });

  it("matches substrings case-insensitively", () => {
    const rules = [rule({ id: "a", pattern: "github" })];
    expect(matchRule({ description: "GITHUB INC" }, rules)).toBe("cat-a");
    expect(matchRule({ description: "github inc" }, [rule({ id: "b", pattern: "GITHUB" })])).toBe(
      "cat-b"
    );
  });

  it("matches regex patterns case-insensitively", () => {
    const rules = [rule({ id: "a", matchType: "REGEX", pattern: "^aws\\b.*services" })];
    expect(matchRule({ description: "AWS Web Services" }, rules)).toBe("cat-a");
    expect(matchRule({ description: "NOT AWS SERVICES" }, rules)).toBeNull();
  });

  it("picks the lowest priority number first (lower wins)", () => {
    const rules = [
      rule({ id: "low", pattern: "coffee", priority: 200 }),
      rule({ id: "high", pattern: "coffee", priority: 10 }),
    ];
    expect(matchRule({ description: "BLUE BOTTLE COFFEE" }, rules)).toBe("cat-high");
  });

  it("breaks priority ties by createdAt asc, undefined last", () => {
    const rules = [
      rule({ id: "newer", pattern: "aws", priority: 10, createdAt: new Date("2026-02-01") }),
      rule({ id: "older", pattern: "aws", priority: 10, createdAt: new Date("2026-01-01") }),
    ];
    expect(matchRule({ description: "AWS" }, rules)).toBe("cat-older");

    const withUndefined = [
      rule({ id: "no-date", pattern: "aws", priority: 10 }),
      rule({ id: "dated", pattern: "aws", priority: 10, createdAt: new Date("2026-06-01") }),
    ];
    expect(matchRule({ description: "AWS" }, withUndefined)).toBe("cat-dated");
  });

  it("first match wins: a lower-priority non-matching rule falls through", () => {
    const rules = [
      rule({ id: "first", pattern: "airline", priority: 1 }),
      rule({ id: "second", pattern: "united", priority: 2 }),
    ];
    expect(matchRule({ description: "UNITED 0162345678901" }, rules)).toBe("cat-second");
  });

  it("skips invalid regex patterns silently and keeps evaluating", () => {
    const rules = [
      rule({ id: "bad", matchType: "REGEX", pattern: "([invalid", priority: 1 }),
      rule({ id: "good", pattern: "coffee", priority: 2 }),
    ];
    expect(() => matchRule({ description: "COFFEE" }, rules)).not.toThrow();
    expect(matchRule({ description: "COFFEE" }, rules)).toBe("cat-good");
  });

  it("skips MERCHANT rules when the transaction has no merchant", () => {
    const rules = [
      rule({ id: "merchant", field: "MERCHANT", pattern: "stripe", priority: 1 }),
      rule({ id: "desc", pattern: "stripe", priority: 2 }),
    ];
    expect(matchRule({ description: "STRIPE PAYOUT", merchant: null }, rules)).toBe("cat-desc");
    expect(matchRule({ description: "STRIPE PAYOUT" }, rules)).toBe("cat-desc");
  });

  it("matches MERCHANT rules against the merchant field", () => {
    const rules = [rule({ id: "m", field: "MERCHANT", pattern: "stripe" })];
    expect(matchRule({ description: "PAYOUT", merchant: "Stripe, Inc." }, rules)).toBe("cat-m");
    expect(matchRule({ description: "STRIPE PAYOUT", merchant: "Other" }, rules)).toBeNull();
  });

  it("does not mutate the caller's rules array order", () => {
    const rules = [
      rule({ id: "b", pattern: "x", priority: 2 }),
      rule({ id: "a", pattern: "x", priority: 1 }),
    ];
    matchRule({ description: "x" }, rules);
    expect(rules.map((r) => r.id)).toEqual(["b", "a"]);
  });
});
