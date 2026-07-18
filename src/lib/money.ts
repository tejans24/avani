/**
 * Money utilities. All monetary amounts are stored as integer cents.
 * Tax rates are stored as basis points (875 = 8.75%).
 */

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format integer cents as US dollars, e.g. 594000 -> "$5,940.00", -1234 -> "-$12.34". */
export function formatCents(cents: number): string {
  return usdFormatter.format(cents / 100);
}

/**
 * Parse a user-entered dollar amount ("90", "90.5", "$1,234.56") into integer cents.
 * Returns null for anything invalid (garbage, negatives, empty input).
 * Fractions beyond 2 decimal places round half away from zero to the nearest cent.
 */
export function dollarsToCents(input: string | number): number | null {
  let str: string;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    str = String(input);
    // Extremely large/small numbers stringify in scientific notation; reject those.
    if (/[eE]/.test(str)) return null;
  } else {
    str = input;
  }

  str = str.trim();
  // Optional leading "$", integer part with optional thousands separators, optional fraction.
  const match = /^\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d*))?$/.exec(str);
  if (!match) return null;

  const intPart = match[1].replace(/,/g, "");
  const fracDigits = match[2] ?? "";

  let cents =
    parseInt(intPart, 10) * 100 +
    (fracDigits.length > 0 ? parseInt(fracDigits.slice(0, 2).padEnd(2, "0"), 10) : 0);

  // Round half away from zero based on the third fractional digit.
  if (fracDigits.length > 2 && fracDigits.charCodeAt(2) - 48 >= 5) {
    cents += 1;
  }

  if (!Number.isSafeInteger(cents)) return null;
  return cents;
}

/** Line amount in cents: quantity (hours, up to 2dp) times unit price in cents, rounded. */
export function computeLineAmountCents(quantityHours: number, unitPriceCents: number): number {
  return Math.round(quantityHours * unitPriceCents);
}

export interface InvoiceTotals {
  lineAmountsCents: number[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
}

/** Compute per-line amounts, subtotal, tax (rounded from basis points) and total. */
export function computeInvoiceTotals(
  items: { quantity: number; unitPriceCents: number }[],
  taxRateBps: number
): InvoiceTotals {
  const lineAmountsCents = items.map((item) =>
    computeLineAmountCents(item.quantity, item.unitPriceCents)
  );
  const subtotalCents = lineAmountsCents.reduce((sum, amount) => sum + amount, 0);
  const taxCents = Math.round((subtotalCents * taxRateBps) / 10000);
  const totalCents = subtotalCents + taxCents;
  return { lineAmountsCents, subtotalCents, taxCents, totalCents };
}

/** Format basis points as a percentage string: 875 -> "8.75%", 1000 -> "10%", 0 -> "0%". */
export function formatBps(bps: number): string {
  const pct = (bps / 100).toFixed(2).replace(/\.?0+$/, "");
  return `${pct === "" ? "0" : pct}%`;
}
