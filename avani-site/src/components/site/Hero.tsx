import React from "react";
import { Eyebrow } from "@/ds/components/core/Eyebrow";
import { Button } from "@/ds/components/core/Button";

const audiences = [
  "Public-sector teams",
  "Operations leads",
  "Founders & SMBs",
  "Service delivery",
];

export function Hero() {
  return (
    <section id="top" style={{ position: "relative", overflow: "hidden" }}>
      <div
        className="container"
        style={{
          paddingTop: "clamp(3.5rem, 2rem + 7vw, 7rem)",
          paddingBottom: "var(--section-y)",
        }}
      >
        <div style={{ maxWidth: 900 }}>
          <Eyebrow style={{ marginBottom: 26 }}>AI systems consulting</Eyebrow>
          <h1
            style={{
              fontSize: "var(--text-display)",
              lineHeight: 1.04,
              letterSpacing: "-0.022em",
              margin: "0 0 28px",
              maxWidth: "15ch",
            }}
          >
            Thoughtful systems. Real efficiency.{" "}
            <span style={{ fontStyle: "italic", color: "var(--clay)" }}>
              Responsible AI.
            </span>
          </h1>
          <p
            style={{
              fontSize: "var(--text-lead)",
              lineHeight: 1.5,
              color: "var(--text-secondary)",
              maxWidth: "46ch",
              margin: "0 0 38px",
            }}
          >
            We help growing businesses and public-sector teams run leaner and
            build better with AI — done thoughtfully, not hastily.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 14,
              alignItems: "center",
            }}
          >
            <Button href="#contact" variant="accent" size="lg">
              Start a conversation
            </Button>
            <Button href="#process" variant="secondary" size="lg">
              See how we work
            </Button>
          </div>
        </div>
        <div
          style={{
            marginTop: "clamp(3rem, 2rem + 4vw, 5rem)",
            display: "flex",
            flexWrap: "wrap",
            gap: "clamp(1.5rem,4vw,3.5rem)",
            alignItems: "center",
            color: "var(--text-muted)",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            Trusted approach for
          </span>
          <span
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "clamp(1.25rem,3vw,2.5rem)",
            }}
          >
            {audiences.map((t) => (
              <span key={t} style={{ fontSize: 15, color: "var(--ink-soft)" }}>
                {t}
              </span>
            ))}
          </span>
        </div>
      </div>
    </section>
  );
}
