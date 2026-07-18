"use client";
import React from "react";
import { Button } from "@/ds/components/core/Button";

const MARK = "/brand/mark-sun.svg";

const links: [string, string][] = [
  ["What we do", "#services"],
  ["How we work", "#process"],
  ["About", "#about"],
  ["Proof", "#proof"],
];

export function SiteHeader() {
  const [open, setOpen] = React.useState(false);
  const [solid, setSolid] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: solid ? "rgba(251,248,241,0.86)" : "transparent",
        backdropFilter: solid ? "saturate(1.1) blur(10px)" : "none",
        borderBottom: solid
          ? "1px solid var(--border-subtle)"
          : "1px solid transparent",
        transition:
          "background .3s var(--ease-standard), border-color .3s var(--ease-standard)",
      }}
    >
      <div
        className="container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 72,
        }}
      >
        <a
          href="#top"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MARK} width="30" height="30" alt="" />
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 500,
              fontSize: 23,
              color: "var(--ink)",
              letterSpacing: "-0.01em",
            }}
          >
            Avani
          </span>
        </a>
        <nav
          className="nav-desktop"
          style={{ display: "flex", alignItems: "center", gap: 30 }}
        >
          {links.map(([l, h]) => (
            <a
              key={h}
              href={h}
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 15,
                fontWeight: 500,
                color: "var(--ink-soft)",
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = "var(--clay)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "var(--ink-soft)")
              }
            >
              {l}
            </a>
          ))}
          <Button href="/sign-in" variant="ghost" size="sm">
            Sign in
          </Button>
          <Button href="#contact" variant="primary" size="sm">
            Start a conversation
          </Button>
        </nav>
        <button
          className="nav-toggle"
          aria-label="Menu"
          onClick={() => setOpen(!open)}
          style={{
            display: "none",
            background: "none",
            border: 0,
            fontSize: 22,
            color: "var(--ink)",
            cursor: "pointer",
          }}
        >
          {open ? "✕" : "≡"}
        </button>
      </div>
      {open && (
        <div
          className="container"
          style={{
            paddingBottom: 18,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {links.map(([l, h]) => (
            <a
              key={h}
              href={h}
              onClick={() => setOpen(false)}
              style={{
                padding: "11px 0",
                fontFamily: "var(--font-sans)",
                fontSize: 17,
                fontWeight: 500,
                color: "var(--ink)",
                textDecoration: "none",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              {l}
            </a>
          ))}
          <Button
            href="#contact"
            variant="primary"
            size="md"
            style={{ marginTop: 12 }}
            onClick={() => setOpen(false)}
          >
            Start a conversation
          </Button>
        </div>
      )}
    </header>
  );
}
