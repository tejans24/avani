/**
 * Refresh every enabled job board now (the tick does a few per run).
 *
 *   npm run jobs:refresh            # all boards, regardless of when last fetched
 *   JOBS_SOURCE_MODE=fake npm run jobs:refresh   # fixtures from e2e/fixtures/jobs
 */
import "dotenv/config";
import { db } from "../src/lib/db";
import { runJobRefresh } from "../src/lib/jobs/refresh";

async function main() {
  const boards = await db.jobBoard.count({ where: { enabled: true } });
  const run = await runJobRefresh({ maxBoards: boards, staleHours: 0 });
  for (const b of run.boards) {
    const r = b.report;
    console.log(
      `${b.ok ? "ok  " : "FAIL"} ${b.companyName.padEnd(36)} ` +
        (r ? `${r.created.length} new, ${r.refreshed} refreshed, ${r.aliased} duplicates merged, ${r.dismissed} deleted-skipped` : b.error)
    );
  }
  console.log(`\nRescored ${run.rescored}. Announced ${run.announced} strong new match(es).`);
  await db.$disconnect();
}

main();
