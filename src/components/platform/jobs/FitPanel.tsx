"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { analyzeJobFit } from "@/actions/jobs";
import { Badge, Button, Eyebrow } from "@/components/platform/ds";
import { FIT_VERDICT_LABEL, PACE_LABEL, SCREEN_ODDS_LABEL, type FitAnalysis, type FitVerdict, type Pace } from "@/lib/jobs/fit";
import { ActionMessage, useAction } from "./useAction";

const VERDICT_TONE: Record<FitVerdict, "positive" | "caution" | "neutral" | "critical"> = {
  APPLY: "positive",
  APPLY_LOW_EFFORT: "caution",
  WATCH: "neutral",
  SKIP: "critical",
  GET_CERT_FIRST: "caution",
  CLOSED: "neutral",
};
const STATUS_COLOR: Record<string, string> = {
  PASS: "var(--positive)",
  MET: "var(--positive)",
  COVERED: "var(--positive)",
  FAIL: "var(--critical)",
  NOT_MET: "var(--critical)",
  GAP: "var(--critical)",
  STRETCH: "var(--caution)",
  SKILLS_LIST_ONLY: "var(--caution)",
  UNDER_TARGET: "var(--caution)",
  UNKNOWN: "var(--text-muted)",
};
const STATUS_LABEL: Record<string, string> = {
  PASS: "Pass",
  FAIL: "Fail",
  UNKNOWN: "Unknown",
  MET: "Met",
  NOT_MET: "Not met",
  COVERED: "Covered",
  SKILLS_LIST_ONLY: "Skills list only",
  GAP: "Gap",
  STRETCH: "Stretch",
  UNDER_TARGET: "Under target",
};
const PACE_COLOR: Record<Pace, string> = { CALM: "var(--positive)", STEADY: "var(--text-secondary)", INTENSE: "var(--critical)", UNKNOWN: "var(--text-muted)" };
const KIND_LABEL = { MUST_HAVE: "Must-have", PREFERRED: "Preferred", DEALBREAKER: "Dealbreaker" } as const;

const small = { fontSize: "var(--text-sm)" } as const;
const muted = { ...small, color: "var(--text-muted)" } as const;

function Status({ s }: { s: string }) {
  return <span style={{ ...small, color: STATUS_COLOR[s] ?? "inherit", fontWeight: 600, whiteSpace: "nowrap" }}>{STATUS_LABEL[s] ?? s}</span>;
}

function Section({ title, children, open = true }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} style={{ display: "grid", gap: 6 }}>
      <summary style={{ cursor: "pointer", fontFamily: "var(--font-sans)", fontWeight: 600, letterSpacing: "0.04em", fontSize: "var(--text-sm)" }}>
        {title}
      </summary>
      <div style={{ marginTop: 6 }}>{children}</div>
    </details>
  );
}

function List({ items, ordered }: { items: string[]; ordered?: boolean }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag style={{ ...small, margin: 0, paddingLeft: 20, display: "grid", gap: 4 }}>
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </Tag>
  );
}

/**
 * The job posting evaluator's report (fit-prompt.ts). Runs on its own the
 * first time a job that passed the filters is opened, when Claude is set up
 * and there's a master résumé; "Evaluate again" reruns it.
 */
export function FitPanel({
  postingId,
  analysis,
  bulletText,
  aiEnabled,
  autoRun,
  notRemote = false,
}: {
  postingId: string;
  analysis: FitAnalysis | null;
  /** Text of the résumé bullets the fit table cites, by id. */
  bulletText: Record<string, string>;
  aiEnabled: boolean;
  autoRun: boolean;
  /** Not remote: Claude waits to be asked. */
  notRemote?: boolean;
}) {
  const { pending, error, run } = useAction();
  const started = useRef(false);
  const analyze = () => run(() => analyzeJobFit(postingId));

  useEffect(() => {
    if (!autoRun || analysis || started.current) return;
    started.current = true;
    analyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, analysis]);

  const a = analysis;
  return (
    <div className="form-card" style={{ marginBottom: 28, display: "grid", gap: 16 }} data-testid="fit-panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <Eyebrow index="AI">Is it worth it?</Eyebrow>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {a && (
            <span style={muted}>
              {a.model === "fake" ? "Test evaluation" : "Claude"} · {a.analyzedAt.slice(0, 10)}
            </span>
          )}
          {aiEnabled && (
            <Button type="button" variant={a ? "ghost" : "primary"} size="sm" disabled={pending} onClick={analyze}>
              {pending ? "Evaluating…" : a ? "Evaluate again" : "Evaluate"}
            </Button>
          )}
        </div>
      </div>
      <ActionMessage error={error} />

      {!a && (
        <p style={{ ...small, margin: 0, color: "var(--text-secondary)" }}>
          {pending
            ? "Claude is reading the posting against your criteria and résumé. This takes a minute or two."
            : aiEnabled && notRemote
              ? "This job isn't remote, so Claude doesn't read it unless you ask. Evaluate to get its read."
              : aiEnabled
              ? "Claude reads the posting the way the recruiter and hiring manager will, against your criteria and résumé content. Your contact details are never sent."
              : "Set ANTHROPIC_API_KEY to have Claude evaluate this job against your criteria and résumé."}
        </p>
      )}

      {a && (
        <>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <Badge tone={VERDICT_TONE[a.verdict]} style={{ fontSize: "var(--text-base)", padding: "4px 10px" }}>
                {FIT_VERDICT_LABEL[a.verdict]}
              </Badge>
              <span style={{ fontWeight: 600 }}>{a.reason}</span>
            </div>
            <span style={muted}>
              Screen odds: {SCREEN_ODDS_LABEL[a.screenOdds]}
              {a.pace && (
                <>
                  {" "}
                  · pace: <strong style={{ color: PACE_COLOR[a.pace.rating] }}>{PACE_LABEL[a.pace.rating]}</strong> ({a.pace.why})
                </>
              )}
            </span>
            {a.verdictDetail && <p style={{ ...small, margin: 0 }}>{a.verdictDetail}</p>}
            {a.watchTerms.length > 0 && <p style={{ ...small, margin: 0 }}>Alert on: {a.watchTerms.join(", ")}</p>}
            {a.certToGet && <p style={{ ...small, margin: 0 }}>Cert to get: {a.certToGet}</p>}
            <p style={{ ...muted, margin: 0 }}>
              App checks: location <Status s={a.codeChecks.location.status} /> ({a.codeChecks.location.note}) · pay <Status s={a.codeChecks.pay.status} /> (
              {a.codeChecks.pay.note})
              {a.codeChecks.citizenship && (
                <>
                  {" "}
                  · citizenship <Status s={a.codeChecks.citizenship.status} /> ({a.codeChecks.citizenship.note})
                </>
              )}
              {a.codeChecks.clearance && (
                <>
                  {" "}
                  · clearance <Status s={a.codeChecks.clearance.status} /> ({a.codeChecks.clearance.note})
                </>
              )}
            </p>
          </div>

          {a.checks.length > 0 && (
            <ul style={{ ...small, margin: 0, paddingLeft: 18, color: "var(--caution)" }}>
              {a.checks.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}

          {a.gates.some((g) => g.status === "FAIL") && (
            <ul style={{ ...small, margin: 0, paddingLeft: 18, color: "var(--critical)" }} aria-label="Failed gates">
              {a.gates
                .filter((g) => g.status === "FAIL")
                .map((g) => (
                  <li key={g.requirement}>
                    {g.requirement}: {g.evidence}
                    {g.likelyKnockout ? " (likely knockout)" : ""}
                  </li>
                ))}
            </ul>
          )}

          <details className="fit-full">
            <summary style={{ ...small, cursor: "pointer", color: "var(--text-secondary)" }}>
              Full evaluation: gates, the real job, criteria, pay, fit table{a.tailoring ? ", tailoring plan" : ""}
            </summary>
            <div style={{ display: "grid", gap: 16, marginTop: 14 }}>
          <Section title="GATES">
            <table className="data-table">
              <tbody>
                {a.gates.map((g) => (
                  <tr key={g.requirement}>
                    <td style={small}>{g.requirement}</td>
                    <td>
                      <Status s={g.status} />
                      {g.status === "FAIL" && g.likelyKnockout ? <div style={{ ...small, color: "var(--critical)" }}>likely knockout</div> : null}
                    </td>
                    <td style={{ ...small, color: "var(--text-secondary)" }}>{g.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title="REAL JOB">
            <p style={{ ...small, margin: "0 0 6px" }}>
              <strong>{a.realJob.shape}</strong>
            </p>
            <ul style={{ ...small, margin: 0, paddingLeft: 18, color: "var(--text-secondary)" }}>
              {a.realJob.quotes.map((q, i) => (
                <li key={q}>
                  <em>&ldquo;{q}&rdquo;</em>
                  {a.unverifiedQuotes.includes(i) ? <span style={{ color: "var(--caution)" }}> (not in the posting as written)</span> : null}
                </li>
              ))}
            </ul>
            <p style={{ ...small, margin: "6px 0 0" }}>Tempo: {a.realJob.tempo.length ? a.realJob.tempo.join("; ") : "no signals"}</p>
          </Section>

          <Section title="CRITERIA">
            <table className="data-table">
              <tbody>
                {a.criteria.map((c) => (
                  <tr key={c.criterion}>
                    <td style={small}>
                      {c.criterion}
                      <div style={muted}>{KIND_LABEL[c.kind]}</div>
                    </td>
                    <td>
                      <Status s={c.met} />
                    </td>
                    <td style={{ ...small, color: "var(--text-secondary)" }}>{c.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title="PAY">
            <div style={{ ...small, display: "grid", gap: 4 }}>
              <div>
                <strong>Actually pays:</strong> {a.pay.actual}
              </div>
              {a.pay.formEntry && (
                <div>
                  <strong>On the form:</strong> {a.pay.formEntry}
                </div>
              )}
              {a.pay.askOnCall && (
                <div>
                  <strong>On the call:</strong> {a.pay.askOnCall}
                </div>
              )}
            </div>
          </Section>

          <Section title="FIT TABLE" open={false}>
            <table className="data-table">
              <tbody>
                {a.fitTable.map((r) => (
                  <tr key={r.item}>
                    <td style={small}>{r.item}</td>
                    <td>
                      <Status s={r.status} />
                    </td>
                    <td style={{ ...small, color: "var(--text-secondary)" }}>
                      {r.evidence}
                      {r.bulletIds.map((id) =>
                        bulletText[id] ? (
                          <div key={id} style={{ color: "var(--text-muted)" }}>
                            ↳ {bulletText[id]}
                          </div>
                        ) : null
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {a.tailoring && (
            <Section title="TAILORING" open={false}>
              <div style={{ ...small, display: "grid", gap: 8 }}>
                <div>
                  <strong>Header:</strong> {a.tailoring.header}
                </div>
                <div>
                  <strong>Summary:</strong> {a.tailoring.summary}
                </div>
                <div>
                  <strong>Skills.</strong> Lead: {a.tailoring.skillsLead.join("; ") || "none"}. Add: {a.tailoring.skillsAdd.join("; ") || "none"}. Cut:{" "}
                  {a.tailoring.skillsCut.join("; ") || "none"}.
                </div>
                {a.tailoring.bullets.length > 0 && (
                  <div>
                    <strong>Bullets</strong>
                    <List items={a.tailoring.bullets} />
                  </div>
                )}
                <div>
                  <strong>Cover letter:</strong> {a.tailoring.coverLetter}
                </div>
                {a.tailoring.honestyFlags.length > 0 && (
                  <div>
                    <strong>Honesty flags</strong>
                    <List items={a.tailoring.honestyFlags} />
                  </div>
                )}
              </div>
            </Section>
          )}

          {a.formFields.length > 0 && (
            <Section title="FORM FIELDS" open={false}>
              <table className="data-table">
                <tbody>
                  {a.formFields.map((f) => (
                    <tr key={f.field}>
                      <td style={small}>{f.field}</td>
                      <td style={{ ...small, color: "var(--text-secondary)" }}>{f.answer}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {a.next.length > 0 && (
            <Section title="NEXT">
              <List items={a.next} ordered />
            </Section>
          )}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
