/**
 * Discover government IT contractors located in MD, DC and VA — big and
 * small — from USAspending.gov award data (public API, no key).
 *
 *   npx tsx scripts/discover-contractors.ts [out.json] [--years 2] [--min 1000000]
 *
 * Ranks recipients of federal contracts under IT services NAICS codes
 * (541511 custom programming, 541512 systems design, 541519 other computer
 * services) by obligated dollars over the last N fiscal years, per state.
 * Use the output to grow src/lib/jobs/contractors.ts, then run
 * verify-job-boards.ts on the additions. Read-only.
 */
import { writeFileSync } from "node:fs";

const ENDPOINT = "https://api.usaspending.gov/api/v2/search/spending_by_category/recipient/";
const NAICS = ["541511", "541512", "541519"];
const STATES = ["MD", "DC", "VA"];
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

type Row = { name: string; amount: number; state: string };

async function fetchState(state: string, start: string, end: string, min: number): Promise<Row[]> {
  const rows: Row[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filters: {
          time_period: [{ start_date: start, end_date: end }],
          award_type_codes: ["A", "B", "C", "D"],
          naics_codes: { require: NAICS },
          recipient_locations: [{ country: "USA", state }],
        },
        limit: PAGE_SIZE,
        page,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`USAspending ${res.status} for ${state}: ${await res.text()}`);
    const data = (await res.json()) as { results: { name: string; amount: number }[]; page_metadata: { hasNext: boolean } };
    for (const r of data.results) if (r.amount >= min) rows.push({ name: r.name, amount: r.amount, state });
    if (!data.page_metadata?.hasNext || data.results.at(-1)!.amount < min) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  return rows;
}

async function main() {
  const args = process.argv.slice(2);
  const out = args.find((a) => a.endsWith(".json")) ?? "contractors-discovered.json";
  const flag = (name: string, fallback: number) => {
    const i = args.indexOf(name);
    return i >= 0 && Number(args[i + 1]) > 0 ? Number(args[i + 1]) : fallback;
  };
  const years = flag("--years", 2);
  const min = flag("--min", 1_000_000);
  const end = new Date();
  const start = new Date(end);
  start.setFullYear(end.getFullYear() - years);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const all: Row[] = [];
  for (const s of STATES) all.push(...(await fetchState(s, iso(start), iso(end), min)));
  all.sort((a, b) => b.amount - a.amount);
  writeFileSync(out, JSON.stringify(all, null, 2) + "\n");
  for (const r of all.slice(0, 50)) console.log(`${r.state}  $${(r.amount / 1e6).toFixed(1).padStart(8)}M  ${r.name}`);
  console.log(`\n${all.length} recipients ≥ $${(min / 1e6).toFixed(1)}M over ${years}y. Full list: ${out}`);
}

main();
