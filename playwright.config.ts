import { defineConfig } from "@playwright/test";

const PORT = 3100;
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://avani:avani@localhost:5432/avani_test";

export default defineConfig({
  testDir: "./e2e",
  // Specs share one database — run files serially, tests in order within a file.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // Sandbox provides a system Chromium; PW_CHROMIUM_PATH overrides when the
    // pinned browser build isn't downloaded (e.g. this dev sandbox).
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
      : {}),
  },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
      AUTH_MODE: "test",
      EMAIL_MODE: "fake",
      ALLOWED_EMAILS: "owner@example.com",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_placeholder",
      CLERK_SECRET_KEY: "sk_test_placeholder",
    },
  },
});
