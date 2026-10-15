import { describe, expect, it } from "vitest";
import { autoEvaluates, parseView, triageKey, verdictBucket } from "@/lib/jobs/views";

const p = (over: Partial<Parameters<typeof triageKey>[0]> = {}) => ({
  status: "NEW",
  filterFailures: [] as string[],
  closedAt: null,
  fitAnalysis: null as unknown,
  score: 60,
  scoreBreakdown: [] as unknown,
  ...over,
});
const fit = (verdict: string, pace = "STEADY") => ({ verdict, reason: `${verdict} because`, pace: { rating: pace, why: "" } });

describe("job list views", () => {
  it("old links still work", () => {
    expect(parseView("matches")).toBe("todo");
    expect(parseView("pipeline")).toBe("applied");
    expect(parseView("filtered")).toBe("notforme");
    expect(parseView(undefined)).toBe("todo");
    expect(parseView("archived")).toBe("archived");
  });

  it("only jobs worth applying to stay in To apply; the rest say why they're out", () => {
    expect(verdictBucket(p()).bucket).toBe("todo"); // not read yet
    expect(verdictBucket(p({ fitAnalysis: fit("APPLY_LOW_EFFORT") })).bucket).toBe("todo");
    expect(verdictBucket(p({ fitAnalysis: fit("SKIP") }))).toEqual({ bucket: "notforme", why: "SKIP because" });
    expect(verdictBucket(p({ filterFailures: ["On-site role"] }))).toEqual({ bucket: "notforme", why: "On-site role" });
    expect(verdictBucket(p({ status: "SKIPPED", fitAnalysis: fit("APPLY") })).why).toBe("You skipped it");
  });

  it("orders Claude's picks first, then unread jobs, and a calm pace outranks a slightly higher score", () => {
    const apply = p({ fitAnalysis: fit("APPLY"), score: 50 });
    const unread = p({ score: 95 });
    const lowEffort = p({ fitAnalysis: fit("APPLY_LOW_EFFORT"), score: 90 });
    const sorted = [unread, lowEffort, apply].sort((a, b) => triageKey(a) - triageKey(b));
    expect(sorted).toEqual([apply, lowEffort, unread]);

    const calm = p({ fitAnalysis: fit("APPLY", "CALM"), score: 70 });
    const intense = p({ fitAnalysis: fit("APPLY", "INTENSE"), score: 80 });
    expect(triageKey(calm)).toBeLessThan(triageKey(intense));
  });
});

describe("automatic evaluation", () => {
  it("only remote jobs are read without being asked", () => {
    expect(autoEvaluates("REMOTE")).toBe(true);
    for (const m of ["OCCASIONAL_HYBRID", "HYBRID", "ONSITE", "UNKNOWN"]) expect(autoEvaluates(m)).toBe(false);
  });
});

describe("madeAgo", () => {
  it("says how long ago a résumé version was made", async () => {
    const { madeAgo } = await import("@/lib/jobs/display");
    const now = new Date("2026-10-07T15:00:00Z");
    const before = (ms: number) => new Date(now.getTime() - ms);
    expect(madeAgo(before(20_000), now)).toBe("just now");
    expect(madeAgo(before(12 * 60_000), now)).toBe("12 min ago");
    expect(madeAgo(before(3 * 3_600_000), now)).toBe("3 h ago");
    expect(madeAgo(before(30 * 3_600_000), now)).toBe("yesterday");
    expect(madeAgo(before(5 * 86_400_000), now)).toBe("5 days ago");
    expect(madeAgo(new Date("2026-08-01T12:00:00Z"), now)).toBe("Aug 1");
  });
});
