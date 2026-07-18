import React from "react";
import { Eyebrow } from "@/ds/components/core/Eyebrow";
import { Callout } from "@/ds/components/core/Callout";

export function About() {
  return (
    <section id="about" className="section section--alt">
      <div className="container">
        <div className="about-grid">
          <div className="about-portrait" aria-hidden>
            <div className="portrait-ph">
              <span>Team</span>
            </div>
          </div>
          <div>
            <Eyebrow index="03">About</Eyebrow>
            <h2 style={{ margin: "18px 0 24px", maxWidth: "20ch" }}>
              We value doing things well over doing them loud.
            </h2>
            <p
              style={{
                fontSize: 18,
                lineHeight: 1.65,
                color: "var(--text-secondary)",
                maxWidth: "52ch",
                margin: "0 0 18px",
              }}
            >
              We've spent years helping teams replace busywork with systems that
              actually hold up — in operations, service delivery, and the public
              sector, where the stakes are real and trust is earned slowly.
            </p>
            <p
              style={{
                fontSize: 18,
                lineHeight: 1.65,
                color: "var(--text-secondary)",
                maxWidth: "52ch",
                margin: "0 0 30px",
              }}
            >
              We're not here to sell you on AI. We're here to find where it
              genuinely helps, build it carefully, and leave you better equipped
              than before.
            </p>
            <Callout tone="accent">
              We'd rather ship one reliable system than ten clever demos.
            </Callout>
            <div
              style={{
                marginTop: 30,
                fontFamily: "var(--font-display)",
                fontSize: 22,
                color: "var(--ink)",
              }}
            >
              — The Avani team
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
