/**
 * Shift every MM/DD/YY date found in a text (e.g. line-item descriptions like
 * "Consulting Services: 06/14/26 – 06/20/26") by `days` days. Used by
 * "Duplicate for next period" to advance biweekly period ranges.
 */
export function shiftDescriptionDates(text: string, days: number): string {
  return text.replace(/\b(\d{2})\/(\d{2})\/(\d{2})\b/g, (_m, mm, dd, yy) => {
    const date = new Date(
      Date.UTC(2000 + parseInt(yy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10))
    );
    date.setUTCDate(date.getUTCDate() + days);
    const m2 = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d2 = String(date.getUTCDate()).padStart(2, "0");
    const y2 = String(date.getUTCFullYear() % 100).padStart(2, "0");
    return `${m2}/${d2}/${y2}`;
  });
}
