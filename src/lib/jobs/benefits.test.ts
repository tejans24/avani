import { describe, expect, it } from "vitest";

import { extractBenefits, mergeBenefits } from "@/lib/jobs/benefits";

const byKey = (text: string) => Object.fromEntries(extractBenefits(text).map((b) => [b.key, b]));

describe("extractBenefits", () => {
  it("pulls values from a typical commercial benefits section", () => {
    const b = byKey(`
What we offer:
• Medical, dental, and vision insurance — we cover 100% of employee premiums
• 401(k) with a 4% employer match
• 20 days of PTO plus 11 paid holidays
• 16 weeks of paid parental leave
• $1,500 annual learning budget
• Home office stipend
• Stock options`);
    expect(b.health.value).toBe("100% premiums paid");
    expect(b.dentalVision).toBeDefined();
    expect(b.retirement.value).toBe("4% match");
    expect(b.pto.value).toBe("20 days");
    expect(b.holidays.value).toBe("11 holidays");
    expect(b.parentalLeave.value).toBe("16 weeks");
    expect(b.learning.value).toBe("$1,500");
    expect(b.remoteStipend).toBeDefined();
    expect(b.equity).toBeDefined();
    expect(b.pension).toBeUndefined();
  });

  it("recognizes gov-contractor staples: 9/80, tuition assistance, pension", () => {
    const b = byKey(
      "We offer a 9/80 work schedule, tuition assistance, a defined benefit pension, and 11 federal holidays."
    );
    expect(b.flexibleSchedule.value).toBe("9/80");
    expect(b.learning).toBeDefined();
    expect(b.pension).toBeDefined();
    expect(b.holidays.value).toBe("11 holidays");
  });

  it("captures unlimited PTO and keeps the source sentence as evidence", () => {
    const [pto] = extractBenefits("Great team. We offer unlimited PTO. Remote-first.");
    expect(pto).toMatchObject({ key: "pto", value: "Unlimited", evidence: "We offer unlimited PTO." });
  });

  it("narrows evidence to the words around the match in a long paragraph", () => {
    const para =
      "Benefits: medical, dental, and vision insurance with 100% of employee premiums covered; 401(k) with a 5% employer match; " +
      "25 days of PTO plus 11 federal holidays; 12 weeks of paid parental leave; $2,000 annual learning budget.";
    const b = byKey(para);
    expect(b.parentalLeave.evidence).toContain("12 weeks of paid parental leave");
    expect(b.parentalLeave.evidence.length).toBeLessThan(160);
    expect(b.parentalLeave.evidence).not.toContain("vision insurance");
  });

  it("returns nothing for boilerplate without benefits", () => {
    expect(extractBenefits("We are an equal opportunity employer.")).toEqual([]);
  });

  it("does not read a salary sentence as a learning budget", () => {
    const b = byKey("The salary range is $180,000 - $210,000. Tuition reimbursement available.");
    expect(b.learning.value).toBeUndefined();
  });
});

describe("mergeBenefits", () => {
  it("prefers owner > posting > company-wide, and fills values from lower layers", () => {
    const merged = mergeBenefits({
      owner: { retirement: { value: "6% match", note: "Recruiter call" } },
      posting: [{ key: "pto", label: "PTO", evidence: "Generous PTO." }],
      company: [
        { key: "pto", label: "PTO", value: "25 days", evidence: "25 days of PTO." },
        { key: "retirement", label: "401(k)", value: "3% match", evidence: "3% match." },
        { key: "hsa", label: "HSA", evidence: "HSA available." },
      ],
    });
    expect(merged.map((b) => [b.key, b.value, b.source])).toEqual([
      ["hsa", undefined, "company-wide"],
      ["retirement", "6% match", "you"],
      ["pto", "25 days", "posted"],
    ]);
  });
});
