"use client";
import React from "react";
import { Eyebrow } from "@/ds/components/core/Eyebrow";
import { Button } from "@/ds/components/core/Button";
import { Card } from "@/ds/components/core/Card";
import { Field } from "@/ds/components/forms/Field";
import { Input, Textarea } from "@/ds/components/forms/Input";
import { Select } from "@/ds/components/forms/Select";

export function Contact() {
  const [sent, setSent] = React.useState(false);
  return (
    <section id="contact" className="section">
      <div className="container">
        <div className="contact-grid">
          <div>
            <Eyebrow index="05">Contact</Eyebrow>
            <h2 style={{ margin: "18px 0 22px", maxWidth: "16ch" }}>
              Tell me what&apos;s slowing your team down.
            </h2>
            <p
              style={{
                fontSize: 18,
                lineHeight: 1.6,
                color: "var(--text-secondary)",
                maxWidth: "40ch",
                margin: "0 0 28px",
              }}
            >
              No pitch, no pressure. A short, honest conversation about whether —
              and how — we can help.
            </p>
            <div
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <a
                href="mailto:hello@avani.studio"
                style={{
                  fontSize: 17,
                  color: "var(--ink)",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span style={{ color: "var(--clay)" }}>✉</span>{" "}
                hello@avani.studio
              </a>
              <span style={{ fontSize: 15, color: "var(--text-muted)" }}>
                We reply within two working days.
              </span>
            </div>
          </div>

          <Card variant="surface" padding="xl" style={{ alignSelf: "start" }}>
            {sent ? (
              <div style={{ padding: "24px 4px", textAlign: "left" }}>
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: "50%",
                    background: "var(--sage-tint)",
                    color: "var(--forest)",
                    display: "grid",
                    placeContent: "center",
                    fontSize: 22,
                    marginBottom: 18,
                  }}
                >
                  ✓
                </div>
                <h3 style={{ margin: "0 0 8px" }}>
                  Thank you — message received.
                </h3>
                <p style={{ margin: 0, color: "var(--text-secondary)" }}>
                  We&apos;ll be in touch within two working days.{" "}
                  <a href="#top" onClick={() => setSent(false)}>
                    Back to top
                  </a>
                </p>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSent(true);
                }}
                style={{ display: "flex", flexDirection: "column", gap: 18 }}
              >
                <Field label="Name" htmlFor="c-name">
                  <Input id="c-name" placeholder="Your name" required />
                </Field>
                <Field label="Work email" htmlFor="c-email" required>
                  <Input
                    id="c-email"
                    type="email"
                    placeholder="you@org.gov"
                    required
                  />
                </Field>
                <Field label="I'm with a…" htmlFor="c-sector">
                  <Select id="c-sector" defaultValue="public">
                    <option value="smb">Growing business</option>
                    <option value="public">Public-sector team</option>
                    <option value="other">Something else</option>
                  </Select>
                </Field>
                <Field label="What's slowing things down?" htmlFor="c-msg">
                  <Textarea
                    id="c-msg"
                    rows={4}
                    placeholder="A sentence or two is plenty."
                  />
                </Field>
                <Button type="submit" variant="accent" size="lg" fullWidth>
                  Start a conversation
                </Button>
              </form>
            )}
          </Card>
        </div>
      </div>
    </section>
  );
}
