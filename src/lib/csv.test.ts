import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { detectColumns, parseCsv, parseCsvDate } from "@/lib/csv";
import { assignOrdinals } from "@/lib/transactions";

describe("parseCsv", () => {
  it("parses simple rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields with embedded commas", () => {
    expect(parseCsv('a,"b,c",d')).toEqual([["a", "b,c", "d"]]);
  });

  it("handles escaped quotes inside quoted fields", () => {
    expect(parseCsv('"say ""hi""",x')).toEqual([['say "hi"', "x"]]);
  });

  it("handles embedded newlines inside quoted fields", () => {
    expect(parseCsv('"line1\nline2",x')).toEqual([["line1\nline2", "x"]]);
    expect(parseCsv('"line1\r\nline2",x')).toEqual([["line1\r\nline2", "x"]]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strips a leading UTF-8 BOM", () => {
    expect(parseCsv("\uFEFFDate,Amount\n07/01/2026,20.00")).toEqual([
      ["Date", "Amount"],
      ["07/01/2026", "20.00"],
    ]);
  });

  it("skips fully-empty lines and a trailing newline", () => {
    expect(parseCsv("a,b\n\n1,2\n\r\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps empty fields within a row", () => {
    expect(parseCsv("a,,c\n,2,")).toEqual([
      ["a", "", "c"],
      ["", "2", ""],
    ]);
  });

  it("returns no rows for empty input", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("\n\n")).toEqual([]);
  });
});

describe("detectColumns", () => {
  it("detects the exact Amex header at the right indexes", () => {
    const header = ["Date", "Description", "Card Member", "Account #", "Amount"];
    expect(detectColumns(header)).toEqual({ date: 0, description: 1, amount: 4 });
  });

  it("detects generic date header variants", () => {
    expect(detectColumns(["Posted Date", "Memo", "Amount"])).toEqual({
      date: 0,
      description: 1,
      amount: 2,
    });
    expect(detectColumns(["Transaction Date", "Details", "Amount"])).toEqual({
      date: 0,
      description: 1,
      amount: 2,
    });
  });

  it("is case-insensitive and tolerant of surrounding whitespace", () => {
    expect(detectColumns([" DATE ", "description", "AMOUNT"])).toEqual({
      date: 0,
      description: 1,
      amount: 2,
    });
  });

  it("leaves undetected columns undefined", () => {
    expect(detectColumns(["Foo", "Bar"])).toEqual({});
    expect(detectColumns(["Date", "Payee"])).toEqual({ date: 0 });
  });

  it("keeps the first match when multiple columns qualify", () => {
    expect(detectColumns(["Transaction Date", "Posted Date", "Description", "Amount"])).toEqual({
      date: 0,
      description: 2,
      amount: 3,
    });
  });
});

describe("parseCsvDate", () => {
  it("parses MM/DD/YYYY (Amex) into ISO", () => {
    expect(parseCsvDate("07/01/2026")).toBe("2026-07-01");
    expect(parseCsvDate("12/31/2026")).toBe("2026-12-31");
  });

  it("accepts YYYY-MM-DD and returns it normalized", () => {
    expect(parseCsvDate("2026-07-01")).toBe("2026-07-01");
    expect(parseCsvDate(" 2026-02-28 ")).toBe("2026-02-28");
  });

  it("rejects impossible calendar dates", () => {
    expect(parseCsvDate("02/30/2026")).toBeNull();
    expect(parseCsvDate("13/01/2026")).toBeNull();
    expect(parseCsvDate("00/10/2026")).toBeNull();
    expect(parseCsvDate("2026-02-30")).toBeNull();
    expect(parseCsvDate("06/31/2026")).toBeNull();
  });

  it("accepts leap-day dates only in leap years", () => {
    expect(parseCsvDate("02/29/2028")).toBe("2028-02-29");
    expect(parseCsvDate("02/29/2026")).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(parseCsvDate("")).toBeNull();
    expect(parseCsvDate("July 1, 2026")).toBeNull();
    expect(parseCsvDate("7/1/2026")).toBeNull();
    expect(parseCsvDate("2026/07/01")).toBeNull();
    expect(parseCsvDate("07-01-2026")).toBeNull();
  });
});

describe("amex-sample.csv fixture", () => {
  const text = readFileSync(join(process.cwd(), "e2e/fixtures/amex-sample.csv"), "utf8");
  const rows = parseCsv(text);
  const [header, ...data] = rows;

  it("parses the header plus 10 data rows", () => {
    expect(rows).toHaveLength(11);
    expect(data).toHaveLength(10);
  });

  it("detects Amex columns from the fixture header", () => {
    expect(detectColumns(header)).toEqual({ date: 0, description: 1, amount: 4 });
  });

  it("parses the payment row with its negative amount", () => {
    const payment = data.find((r) => r[1] === "ONLINE PAYMENT - THANK YOU");
    expect(payment).toBeDefined();
    expect(payment![4]).toBe("-750.00");
  });

  it("preserves the quoted description containing a comma", () => {
    const uber = data.find((r) => r[1] === "UBER TRIP HELP.UBER.COM, CA");
    expect(uber).toBeDefined();
    expect(uber).toHaveLength(5);
  });

  it("has valid dates in every data row", () => {
    for (const row of data) {
      expect(parseCsvDate(row[0])).toMatch(/^2026-07-\d{2}$/);
    }
  });

  it("assigns ordinals 0 and 1 to the two identical rows", () => {
    const triples = data.map((row) => ({
      dateIso: parseCsvDate(row[0])!,
      amountCents: Math.round(parseFloat(row[4]) * 100),
      description: row[1],
    }));
    const withOrdinals = assignOrdinals(triples);
    const blueBottle = withOrdinals.filter((r) => r.description === "BLUE BOTTLE COFFEE");
    expect(blueBottle.map((r) => r.ordinal)).toEqual([0, 1]);
    const others = withOrdinals.filter((r) => r.description !== "BLUE BOTTLE COFFEE");
    expect(others.every((r) => r.ordinal === 0)).toBe(true);
  });
});
