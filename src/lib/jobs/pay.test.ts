import { describe, expect, it } from "vitest";

import { parsePayRange } from "@/lib/jobs/pay";

describe("parsePayRange", () => {
  it("reads common salary range formats", () => {
    expect(parsePayRange("The base salary range for this role is $185,000 - $215,000.")).toEqual({
      minCents: 185_000_00,
      maxCents: 215_000_00,
    });
    expect(parsePayRange("Pay range: $185K–$215K USD per year")).toEqual({ minCents: 185_000_00, maxCents: 215_000_00 });
    expect(parsePayRange("Compensation $150,000 to $190,000 annually")).toEqual({ minCents: 150_000_00, maxCents: 190_000_00 });
  });

  it("annualizes hourly ranges at 2080 hours", () => {
    expect(parsePayRange("Hourly pay: $85 - $100 per hour")).toEqual({ minCents: 176_800_00, maxCents: 208_000_00 });
  });

  it("ignores funding amounts, budgets and unrelated dollars", () => {
    expect(parsePayRange("We raised $20M - $30M in our Series B.")).toBeNull();
    expect(parsePayRange("A $1,000 - $1,500 learning budget.")).toBeNull();
    expect(parsePayRange("No pay info here.")).toBeNull();
  });
});
