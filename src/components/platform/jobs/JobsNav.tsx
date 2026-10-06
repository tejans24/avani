"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * The Jobs section's own menu. In the sidebar it opens under "Jobs" while
 * you're anywhere in the section; on narrow screens (where the sidebar is a
 * top bar) the same links show as tabs at the top of every Jobs page.
 */
export const JOBS_NAV = [
  { href: "/jobs", label: "Matches", match: (p: string, view: string | null) => p === "/jobs" && (!view || view === "matches" || view === "filtered") },
  { href: "/jobs?view=pipeline", label: "Applications", match: (p: string, view: string | null) => p === "/jobs" && view === "pipeline" },
  { href: "/jobs/capture", label: "Add a job", match: (p: string) => p.startsWith("/jobs/capture") },
  { href: "/jobs/resume", label: "Résumé", match: (p: string) => p.startsWith("/jobs/resume") },
  { href: "/jobs/boards", label: "Sources", match: (p: string) => p.startsWith("/jobs/boards") },
  { href: "/jobs/awards", label: "Federal awards", match: (p: string) => p.startsWith("/jobs/awards") },
];

function useActive() {
  const pathname = usePathname();
  const view = useSearchParams().get("view");
  return (item: (typeof JOBS_NAV)[number]) => item.match(pathname, view);
}

/** Sidebar sub-menu: only while inside the Jobs section. */
export function JobsSubNav() {
  const pathname = usePathname();
  const isActive = useActive();
  if (!pathname.startsWith("/jobs")) return null;
  return (
    <div className="platform-subnav" aria-label="Jobs">
      {JOBS_NAV.map((item) => (
        <Link key={item.href} href={item.href} data-active={isActive(item) || undefined}>
          {item.label}
        </Link>
      ))}
    </div>
  );
}

/** Tabs at the top of Jobs pages, for narrow screens. */
export function JobsTabs() {
  const isActive = useActive();
  const strip = useRef<HTMLElement>(null);
  const activeHref = JOBS_NAV.find(isActive)?.href;
  // Bring the current tab into view by scrolling the strip sideways, never the page.
  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>('[data-active="true"]');
    if (strip.current && el) strip.current.scrollLeft = el.offsetLeft - strip.current.offsetLeft - 16;
  }, [activeHref]);
  return (
    <nav ref={strip} className="jobs-tabs" aria-label="Jobs">
      {JOBS_NAV.map((item) => (
        <Link key={item.href} href={item.href} data-active={isActive(item) || undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
