import { describe, expect, it } from "vitest";

import {
  STAGE_CADENCE_DAYS,
  STAGE_CHECKLIST,
  isGoingCold,
  pipelineValueCents,
  weightedPipelineCents,
} from "@/lib/bd-playbook";

describe("STAGE_CADENCE_DAYS", () => {
  it("nudges leads fastest, prospects weekly, active monthly, past never", () => {
    expect(STAGE_CADENCE_DAYS.LEAD).toBe(3);
    expect(STAGE_CADENCE_DAYS.PROSPECT).toBe(7);
    expect(STAGE_CADENCE_DAYS.ACTIVE).toBe(30);
    expect(STAGE_CADENCE_DAYS.PAST).toBeNull();
  });
});

describe("STAGE_CHECKLIST", () => {
  it("has actionable bullets for every stage", () => {
    for (const stage of ["LEAD", "PROSPECT", "ACTIVE", "PAST"] as const) {
      expect(STAGE_CHECKLIST[stage].length).toBeGreaterThan(0);
    }
  });
});

describe("pipelineValueCents", () => {
  it("sums only open-pipeline stages (LEAD + PROSPECT)", () => {
    const clients = [
      { stage: "LEAD" as const, dealValueCents: 100_00 },
      { stage: "PROSPECT" as const, dealValueCents: 500_00 },
      { stage: "ACTIVE" as const, dealValueCents: 9999_00 }, // excluded
      { stage: "PAST" as const, dealValueCents: 1_00 }, // excluded
    ];
    expect(pipelineValueCents(clients)).toBe(600_00);
  });

  it("treats a missing deal value as zero", () => {
    expect(
      pipelineValueCents([
        { stage: "LEAD", dealValueCents: null },
        { stage: "PROSPECT" },
      ])
    ).toBe(0);
  });
});

describe("weightedPipelineCents", () => {
  it("weights each open-pipeline deal by stage win-probability", () => {
    const clients = [
      { stage: "LEAD" as const, dealValueCents: 1000_00 }, // ×0.2 = 200_00
      { stage: "PROSPECT" as const, dealValueCents: 1000_00 }, // ×0.5 = 500_00
      { stage: "ACTIVE" as const, dealValueCents: 1000_00 }, // excluded
    ];
    expect(weightedPipelineCents(clients)).toBe(700_00);
  });
});

describe("isGoingCold", () => {
  const now = new Date("2026-07-19T12:00:00Z");

  it("is cold when the last touch predates the stage cadence", () => {
    const created = new Date("2026-06-01T00:00:00Z");
    // PROSPECT cadence is 7 days; last contact 10 days ago → cold.
    const lastContact = new Date("2026-07-09T00:00:00Z");
    expect(isGoingCold("PROSPECT", lastContact, now, created)).toBe(true);
  });

  it("is warm when contacted within the cadence", () => {
    const created = new Date("2026-06-01T00:00:00Z");
    const lastContact = new Date("2026-07-17T00:00:00Z"); // 2 days ago
    expect(isGoingCold("PROSPECT", lastContact, now, created)).toBe(false);
  });

  it("falls back to createdAt when never contacted", () => {
    const freshlyCreated = new Date("2026-07-18T00:00:00Z"); // 1 day old
    expect(isGoingCold("LEAD", null, now, freshlyCreated)).toBe(false);
    const staleCreated = new Date("2026-07-10T00:00:00Z"); // 9 days old, LEAD cadence 3
    expect(isGoingCold("LEAD", null, now, staleCreated)).toBe(true);
  });

  it("never chases ACTIVE or PAST clients via going-cold", () => {
    const old = new Date("2026-01-01T00:00:00Z");
    expect(isGoingCold("ACTIVE", old, now, old)).toBe(false);
    expect(isGoingCold("PAST", old, now, old)).toBe(false);
  });
});
