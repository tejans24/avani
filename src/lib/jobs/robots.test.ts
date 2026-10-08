import { describe, expect, it } from "vitest";

import { isAllowed } from "@/lib/jobs/robots";

describe("isAllowed", () => {
  it("allows everything with no robots rules", () => {
    expect(isAllowed("", "/wday/cxs/acme/External/jobs")).toBe(true);
  });

  it("applies the * group's Disallow prefixes", () => {
    const robots = "User-agent: *\nDisallow: /wday/\n";
    expect(isAllowed(robots, "/wday/cxs/acme/External/jobs")).toBe(false);
    expect(isAllowed(robots, "/en-US/External")).toBe(true);
  });

  it("prefers a group naming our agent over *", () => {
    const robots = "User-agent: *\nDisallow: /\n\nUser-agent: AvaniJobFinder\nAllow: /\n";
    expect(isAllowed(robots, "/jobs")).toBe(true);
  });

  it("uses longest match, with Allow winning ties", () => {
    const robots = "User-agent: *\nDisallow: /careers\nAllow: /careers/jobs\n";
    expect(isAllowed(robots, "/careers/jobs/123")).toBe(true);
    expect(isAllowed(robots, "/careers/apply")).toBe(false);
  });

  it("supports * and $ wildcards", () => {
    const robots = "User-agent: *\nDisallow: /*.json$\nDisallow: /*?q=\n";
    expect(isAllowed(robots, "/jobs.json")).toBe(false);
    expect(isAllowed(robots, "/jobs.json?x=1")).toBe(true);
    expect(isAllowed(robots, "/search?q=engineer")).toBe(false);
  });

  it("treats an empty Disallow as allow-all and groups consecutive agents", () => {
    const robots = "User-agent: Googlebot\nUser-agent: *\nDisallow:\n";
    expect(isAllowed(robots, "/anything")).toBe(true);
  });
});
