import React from "react";

const MARK_L = "/brand/mark-sun-light.svg";

const sections: [string, string][] = [
  ["What we do", "#services"],
  ["How we work", "#process"],
  ["About", "#about"],
  ["Proof", "#proof"],
];

export function SiteFooter() {
  return (
    <footer
      style={{
        background: "var(--forest)",
        color: "var(--text-on-brand)",
        paddingTop: "var(--space-9)",
        paddingBottom: "var(--space-7)",
      }}
    >
      <div className="container">
        <div className="footer-grid">
          <div style={{ maxWidth: "34ch" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                marginBottom: 18,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={MARK_L} width="30" height="30" alt="" />
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 500,
                  fontSize: 23,
                  color: "var(--text-on-brand)",
                }}
              >
                Avani
              </span>
            </div>
            <p
              style={{
                color: "var(--sage-soft)",
                fontSize: 16,
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              Thoughtful systems. Real efficiency. Responsible AI.
            </p>
          </div>
          <div
            style={{
              display: "flex",
              gap: "clamp(2rem,6vw,5rem)",
              flexWrap: "wrap",
            }}
          >
            <div>
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11.5,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--sage)",
                  margin: "0 0 14px",
                }}
              >
                Sections
              </p>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                {sections.map(([l, h]) => (
                  <a
                    key={h}
                    href={h}
                    style={{
                      color: "var(--text-on-brand)",
                      textDecoration: "none",
                      fontSize: 15,
                    }}
                  >
                    {l}
                  </a>
                ))}
              </div>
            </div>
            <div>
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11.5,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--sage)",
                  margin: "0 0 14px",
                }}
              >
                Get in touch
              </p>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                <a
                  href="mailto:hello@avani.studio"
                  style={{
                    color: "var(--text-on-brand)",
                    textDecoration: "none",
                    fontSize: 15,
                  }}
                >
                  hello@avani.studio
                </a>
                <a
                  href="#contact"
                  style={{
                    color: "var(--text-on-brand)",
                    textDecoration: "none",
                    fontSize: 15,
                  }}
                >
                  Start a conversation
                </a>
              </div>
            </div>
          </div>
        </div>
        <div
          style={{
            marginTop: "var(--space-8)",
            paddingTop: 22,
            borderTop: "1px solid var(--border-on-dark)",
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 13.5, color: "var(--sage-soft)" }}>
            © 2026 Avani. All rights reserved.
          </span>
          <span style={{ fontSize: 13.5, color: "var(--sage-soft)" }}>
            Built thoughtfully, not hastily.
          </span>
        </div>
      </div>
    </footer>
  );
}
