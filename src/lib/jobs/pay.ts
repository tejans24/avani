/**
 * Pay range from free text, for sources without structured pay (Greenhouse,
 * Workday descriptions). Many states require posted ranges, so most US
 * postings state one somewhere. Returns annualized integer cents.
 *
 * Pure (unit-tested). Deliberately conservative: only dollar amounts that
 * look like a salary or hourly range near pay vocabulary; a lone "$5M Series B"
 * or "$1,500 learning budget" is ignored.
 */

const HOURS_PER_YEAR = 2080;
// "$131,300.00" as well as "$131,300" and "$131K".
const NUM = String.raw`\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+(?:\.\d+)?)\s?(k|K)?`;
// "mid $150,000 to low/mid $170,000": a qualifier may sit before the second amount.
const QUALIFIER = String.raw`(?:(?:low|mid|high|upper|lower)(?:\s*[-/]\s*(?:low|mid|high|upper|lower))*\s+)?`;
const RANGE = new RegExp(`${NUM}\\s*(?:-|–|—|to)\\s*${QUALIFIER}${NUM}(?:\\s*(?:usd|USD))?(\\s*(?:\\/|per|an|a)\\s*(?:hour|hr|year|yr|annum|annually))?`, "g");
const PAY_CONTEXT = /\b(salary|pay|compensation|base|range|annual|hourly|wage|ote)\b/i;

function toDollars(n: string, k: string | undefined): number {
  const v = Number(n.replace(/,/g, ""));
  return k ? v * 1000 : v;
}

export type PayRange = { minCents: number; maxCents: number };

/**
 * A "program budget" or "proposed" range is what the role actually pays when
 * a posting also lists the company's wide band for the job level.
 */
const BUDGET_CONTEXT = /\b(program budget|budget(ed)? (salary|range|for this role)|proposed (salary|pay|range)|target (salary|range) for this (role|position))\b/i;

export function parsePayRange(text: string): PayRange | null {
  let first: PayRange | null = null;
  for (const m of text.matchAll(RANGE)) {
    // Wide enough for "the pay range for the states of California, Colorado, … and the District of Columbia is:".
    const window = text.slice(Math.max(0, (m.index ?? 0) - 400), (m.index ?? 0) + m[0].length + 40);
    let lo = toDollars(m[1], m[2]);
    let hi = toDollars(m[3], m[4]);
    const unit = (m[5] ?? "").toLowerCase();
    const hourly = /hour|hr/.test(unit) || (hi < 500 && lo < 500);
    if (hourly) {
      if (hi < 15 || hi > 400) continue;
      lo *= HOURS_PER_YEAR;
      hi *= HOURS_PER_YEAR;
    } else if (lo < 30_000 || hi > 1_500_000) {
      continue;
    }
    // "$73,900 - $213,600 USD": a stated currency is as good as the word "salary".
    if (!PAY_CONTEXT.test(window) && !unit && !/usd/i.test(m[0])) continue;
    if (hi < lo) [lo, hi] = [hi, lo];
    const range = { minCents: Math.round(lo * 100), maxCents: Math.round(hi * 100) };
    if (BUDGET_CONTEXT.test(text.slice(Math.max(0, (m.index ?? 0) - 160), m.index ?? 0))) return range;
    first ??= range;
  }
  return first;
}
