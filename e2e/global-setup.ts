import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { TEST_DATABASE_URL } from "../playwright.config";
import { resetDb } from "./utils/db";

export default async function globalSetup() {
  execSync("npx prisma migrate deploy", {
    cwd: __dirname + "/..",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });
  await resetDb();
  // clear captured fake emails from previous runs
  rmSync(__dirname + "/../.fake-emails", { recursive: true, force: true });
}
