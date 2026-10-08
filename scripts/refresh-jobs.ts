/**
 * Refresh every enabled job board and award agency now (the tick does a few
 * per run).
 *
 *   npm run jobs:refresh            # all boards + agencies, regardless of last fetch
 *   JOBS_SOURCE_MODE=fake npm run jobs:refresh   # fixtures from e2e/fixtures/jobs
 */
import "dotenv/config";
import { db } from "../src/lib/db";
import { runAwardsRefresh } from "../src/lib/jobs/awards-refresh";
import { runJobRefresh } from "../src/lib/jobs/refresh";

async function main() {
  const boards = await db.jobBoard.count({ where: { enabled: true } });
  if (boards === 0) {
    console.log(
      "No job boards yet. Add them with:\n" +
        "  npm run jobs:verify-boards -- --apply   (checks the company lists, adds the ones that answer)\n" +
        "or at /jobs/boards. Refreshing federal awards only.\n"
    );
  } else {
    const run = await runJobRefresh({ maxBoards: boards, staleHours: 0 });
    for (const b of run.boards) {
      const r = b.report;
      console.log(
        `${b.ok ? "ok  " : "FAIL"} ${b.companyName.padEnd(36)} ` +
          (r ? `${r.created.length} new, ${r.refreshed} refreshed, ${r.aliased} duplicates merged, ${r.dismissed} deleted-skipped` : b.error)
      );
    }
    console.log(`Rescored ${run.rescored}. Announced ${run.announced} strong new match(es).\n`);
  }

  const awards = await runAwardsRefresh({ maxQueries: 50, staleHours: 0 });
  for (const a of awards) {
    console.log(`${a.ok ? "ok  " : "FAIL"} awards ${a.label.padEnd(5)} ${a.ok ? `${a.found} found, ${a.newAwards} new` : a.error}`);
  }
  await db.$disconnect();
}

main();
