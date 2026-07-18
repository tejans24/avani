import React from "react";
import { Eyebrow } from "@/ds/components/core/Eyebrow";

const steps = [
  {
    n: "01",
    t: "Understand",
    d: "We learn how your team actually works before suggesting anything. No assumptions, no templates.",
  },
  {
    n: "02",
    t: "Map",
    d: "We find the real friction and the highest-value, lowest-risk place to start.",
  },
  {
    n: "03",
    t: "Pilot",
    d: "A small, working system in weeks — measured against the outcome that matters.",
  },
  {
    n: "04",
    t: "Hand off",
    d: "You're left able to run and maintain it without us. Documentation, not dependency.",
  },
];

const principles = [
  "Start with the problem, not the tool.",
  "Ship something reliable, not impressive.",
  "Leave you able to run it without us.",
  "Be honest about what AI can't do.",
];

export function Process() {
  return (
    <section id="process" className="section">
      <div className="container">
        <div className="process-grid">
          <div className="process-head">
            <Eyebrow index="02">How we work</Eyebrow>
            <h2 style={{ margin: "18px 0 22px" }}>
              A systematized approach, kept human.
            </h2>
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: 17,
                lineHeight: 1.6,
                maxWidth: "40ch",
              }}
            >
              Every engagement runs the same dependable path — so you always
              know where things stand and what comes next.
            </p>
            <div
              style={{
                marginTop: 32,
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              {principles.map((p) => (
                <div
                  key={p}
                  style={{
                    display: "flex",
                    gap: 13,
                    alignItems: "flex-start",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      marginTop: 9,
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "var(--clay)",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 16.5, color: "var(--ink)" }}>
                    {p}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <ol className="process-steps">
            {steps.map((s, i) => (
              <li
                key={s.n}
                style={{
                  display: "flex",
                  gap: 20,
                  padding: "24px 0",
                  borderTop:
                    i === 0 ? "none" : "1px solid var(--border-subtle)",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 13,
                    color: "var(--eyebrow)",
                    paddingTop: 5,
                    width: 26,
                    flexShrink: 0,
                  }}
                >
                  {s.n}
                </span>
                <div>
                  <h3 style={{ fontSize: 22, margin: "0 0 7px" }}>{s.t}</h3>
                  <p
                    style={{
                      margin: 0,
                      color: "var(--text-secondary)",
                      fontSize: 16,
                      lineHeight: 1.55,
                      maxWidth: "42ch",
                    }}
                  >
                    {s.d}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
