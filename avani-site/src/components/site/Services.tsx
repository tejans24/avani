import React from "react";
import { Eyebrow } from "@/ds/components/core/Eyebrow";
import { Card } from "@/ds/components/core/Card";

const items = [
  {
    n: "01",
    t: "Process design & automation",
    d: "Map how the work really happens, remove the friction, then automate what's left. Less busywork, fewer handoffs, more time on the work that matters.",
  },
  {
    n: "02",
    t: "AI strategy & adoption",
    d: "A clear, honest plan for where AI helps — and where it doesn't. Built around your team's reality, not a vendor's roadmap.",
  },
  {
    n: "03",
    t: "Custom tools & integration",
    d: "Reliable internal tools that connect the systems you already use. Quietly dependable, easy to maintain, made to fit.",
  },
  {
    n: "04",
    t: "Responsible AI & governance",
    d: "Guardrails, transparency and review so AI stays accountable. Especially where decisions affect people and the public.",
  },
];

export function Services() {
  return (
    <section id="services" className="section section--alt">
      <div className="container">
        <div className="section-head">
          <Eyebrow index="01">What we do</Eyebrow>
          <h2 style={{ maxWidth: "18ch", margin: "18px 0 0" }}>
            Practical AI work, framed by the outcome — not the hype.
          </h2>
        </div>
        <div className="grid-2" style={{ marginTop: "var(--space-9)" }}>
          {items.map((it) => (
            <Card
              key={it.n}
              variant="surface"
              interactive
              padding="lg"
              style={{ display: "flex", flexDirection: "column" }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12.5,
                  letterSpacing: "0.12em",
                  color: "var(--eyebrow)",
                }}
              >
                {it.n}
              </span>
              <h3 style={{ margin: "16px 0 12px" }}>{it.t}</h3>
              <p
                style={{
                  margin: 0,
                  color: "var(--text-secondary)",
                  fontSize: 16,
                  lineHeight: 1.6,
                }}
              >
                {it.d}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
