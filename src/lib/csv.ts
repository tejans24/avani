/**
 * Minimal hand-rolled RFC 4180 CSV parsing for bank/card exports.
 *
 * Amex export specifics: header is
 *   Date,Description,Card Member,Account #,Amount
 * with dates as MM/DD/YYYY and CHARGES AS POSITIVE amounts (payments/credits
 * negative). The import wizard therefore exposes an "amounts are charges"
 * toggle which flips signs into the business-perspective convention
 * (see src/lib/transactions.ts).
 */

/**
 * Parse CSV text into rows of fields per RFC 4180. Handles quoted fields,
 * escaped quotes (""), embedded commas/newlines inside quotes, CRLF and LF
 * line endings, a leading UTF-8 BOM, and a trailing newline. Fully-empty
 * lines are skipped.
 */
export function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldStarted = false;

  const endField = () => {
    row.push(field);
    field = "";
    fieldStarted = false;
  };
  const endRow = () => {
    endField();
    // Skip fully-empty lines (a single empty field means the line was blank).
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
    } else if (ch === ",") {
      endField();
    } else if (ch === "\n") {
      endRow();
    } else if (ch === "\r") {
      if (text[i + 1] === "\n") i++;
      endRow();
    } else {
      field += ch;
      fieldStarted = true;
    }
  }
  // Flush the final row unless the text ended with a newline (or was empty).
  if (field !== "" || fieldStarted || row.length > 0) endRow();

  return rows;
}

/**
 * Fuzzy, case-insensitive detection of the date/description/amount columns
 * from a CSV header row. Detects Amex's exact header
 * (Date,Description,Card Member,Account #,Amount -> {date:0, description:1,
 * amount:4}) as well as generic variants like "Posted Date",
 * "Transaction Date", "Memo", "Details". First matching column wins.
 */
export function detectColumns(header: string[]): {
  date?: number;
  description?: number;
  amount?: number;
} {
  const result: { date?: number; description?: number; amount?: number } = {};
  for (let i = 0; i < header.length; i++) {
    const cell = header[i].trim().toLowerCase();
    if (result.date === undefined && cell.includes("date")) {
      result.date = i;
    }
    if (
      result.description === undefined &&
      (cell.includes("description") || cell.includes("memo") || cell.includes("details"))
    ) {
      result.description = i;
    }
    if (result.amount === undefined && cell.includes("amount")) {
      result.amount = i;
    }
  }
  return result;
}

/**
 * Parse a CSV date cell into "YYYY-MM-DD". Accepts "MM/DD/YYYY" (Amex) and
 * "YYYY-MM-DD". Returns null for anything malformed or not a real calendar
 * date (e.g. 02/30/2026).
 */
export function parseCsvDate(s: string): string | null {
  const trimmed = s.trim();
  let year: number, month: number, day: number;

  const us = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (us) {
    month = parseInt(us[1], 10);
    day = parseInt(us[2], 10);
    year = parseInt(us[3], 10);
  } else if (iso) {
    year = parseInt(iso[1], 10);
    month = parseInt(iso[2], 10);
    day = parseInt(iso[3], 10);
  } else {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(
    day
  ).padStart(2, "0")}`;
}
