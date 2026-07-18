import { describe, expect, it } from "vitest";
import { shiftDescriptionDates } from "@/lib/shift-dates";

describe("shiftDescriptionDates", () => {
  it("shifts both ends of a period range by 14 days", () => {
    expect(
      shiftDescriptionDates("Consulting Services: 06/14/26 – 06/20/26", 14)
    ).toBe("Consulting Services: 06/28/26 – 07/04/26");
  });

  it("rolls across month and year boundaries", () => {
    expect(shiftDescriptionDates("12/28/26 – 12/31/26", 14)).toBe(
      "01/11/27 – 01/14/27"
    );
  });

  it("leaves text without dates untouched", () => {
    expect(shiftDescriptionDates("Onboarding and knowledge transfer", 14)).toBe(
      "Onboarding and knowledge transfer"
    );
  });

  it("supports negative shifts", () => {
    expect(shiftDescriptionDates("07/05/26", -14)).toBe("06/21/26");
  });
});
