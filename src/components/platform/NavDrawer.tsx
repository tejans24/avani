"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * The sidebar's links. On wide screens they're always shown; on narrow ones
 * (where the sidebar is a top bar) they fold behind a menu button and open
 * as a panel under the bar. Closes on navigation, Escape, or a tap outside.
 */
export function NavDrawer({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => setOpen(false), [pathname, search]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="nav-toggle"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="platform-nav"
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {open ? (
            <path d="M6 6l12 12M18 6L6 18" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" />
          )}
        </svg>
      </button>
      {open && <div className="nav-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />}
      <nav id="platform-nav" className="platform-nav" data-open={open || undefined}>
        {children}
      </nav>
    </>
  );
}
