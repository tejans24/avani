import { describe, expect, it } from "vitest";

import { isPublicPath } from "@/lib/route-access";

describe("isPublicPath", () => {
  it("keeps the public surfaces public", () => {
    for (const p of ["/", "/sign-in", "/sign-in/factor-one", "/i/abc123", "/i/abc123/pdf", "/api/events/tick", "/manifest.webmanifest"]) {
      expect(isPublicPath(p)).toBe(true);
    }
  });

  it("protects every platform page and API route, including the ones the old list missed", () => {
    for (const p of [
      "/transactions",
      "/accounts",
      "/accounts/abc/import",
      "/activity",
      "/dashboard",
      "/jobs",
      "/jobs/abc/tailor",
      "/api/sync/mercury",
      "/api/reports/pnl/csv",
      "/api/jobs/tailored/abc/pdf",
      "/some-future-page",
    ]) {
      expect(isPublicPath(p)).toBe(false);
    }
  });

  it("does not treat lookalike paths as public", () => {
    expect(isPublicPath("/i")).toBe(false);
    expect(isPublicPath("/sign-inx")).toBe(false);
    expect(isPublicPath("/api/events/tick/extra")).toBe(false);
    expect(isPublicPath("/api/events")).toBe(false);
  });
});
