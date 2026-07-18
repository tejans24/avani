import React from "react";
import { Eyebrow } from "@/ds/components/core/Eyebrow";
import { Stat } from "@/ds/components/core/Stat";
import { Avatar } from "@/ds/components/core/Avatar";

export function Proof() {
  return (
    <section
      id="proof"
      className="section"
      style={{ background: "var(--forest)", color: "var(--text-on-brand)" }}
    >
      <div className="container">
        <Eyebrow index="04" tone="onBrand">
          Proof
        </Eyebrow>
        <h2
          style={{
            color: "var(--text-on-brand)",
            margin: "18px 0 0",
            maxWidth: "20ch",
          }}
        >
          The work speaks quietly, and it lasts.
        </h2>

        <div className="stat-row" style={{ marginTop: "var(--space-9)" }}>
          <Stat
            onBrand
            value="40%"
            label="less time on manual reporting"
            sublabel="County services team"
          />
          <Stat
            onBrand
            value="3 wks"
            label="from audit to a working pilot"
            sublabel="Operations, mid-size SMB"
          />
          <Stat
            onBrand
            value="0"
            label="surprises at handoff"
            sublabel="Documented, owned in-house"
          />
        </div>

        <div style={{ marginTop: "var(--space-9)", display: "grid", gap: 28 }}>
          <blockquote style={{ margin: 0, maxWidth: "40ch" }}>
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                fontSize: "clamp(1.4rem, 1.1rem + 1.2vw, 2rem)",
                lineHeight: 1.4,
                color: "var(--text-on-brand)",
                margin: 0,
              }}
            >
              &ldquo;Calm, clear and genuinely useful. We came out understanding
              our own process better — and running it with far less
              effort.&rdquo;
            </p>
            <footer
              style={{
                marginTop: 22,
                display: "flex",
                alignItems: "center",
                gap: 13,
              }}
            >
              <Avatar name="Dana Whitfield" />
              <span>
                <span
                  style={{
                    display: "block",
                    fontWeight: 600,
                    color: "var(--text-on-brand)",
                  }}
                >
                  Dana Whitfield
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: 14,
                    color: "var(--sage-soft)",
                  }}
                >
                  Director of Operations, public-sector client
                </span>
              </span>
            </footer>
          </blockquote>
        </div>

        <p
          style={{
            marginTop: 40,
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            letterSpacing: "0.04em",
            color: "var(--sage-soft)",
            maxWidth: "60ch",
          }}
        >
          Placeholder results &amp; testimonial — replace with your real case
          studies and client quotes.
        </p>
      </div>
    </section>
  );
}
