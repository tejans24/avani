"use client";

import { useState } from "react";
import { setCompanyAnswers } from "@/actions/jobs";
import { Badge, Button, Eyebrow } from "@/components/platform/ds";
import { INTERVIEW_QUESTIONS } from "@/lib/jobs/scoring-config";
import { ActionMessage, useAction } from "./useAction";

/**
 * Must-haves no posting can prove (a competent person above you, real scope,
 * room for the firm). Answers are per company and shared by its postings.
 */
export function CompanyCallChecklist({
  companyId,
  companyName,
  postingId,
  answers,
}: {
  companyId: string;
  companyName: string;
  postingId: string;
  answers: Record<string, string>;
}) {
  const { pending, error, note, run } = useAction();
  const [values, setValues] = useState<Record<string, string>>(answers);
  const mustHaves = INTERVIEW_QUESTIONS.filter((q) => q.mustHave);
  const answered = mustHaves.filter((q) => values[q.key]?.trim()).length;

  return (
    <div className="form-card" style={{ marginBottom: 28, display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Eyebrow index="03">Verify on the call: {companyName}</Eyebrow>
        <Badge tone={answered === mustHaves.length ? "positive" : "caution"}>
          {answered}/{mustHaves.length} must-haves answered
        </Badge>
      </div>
      <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
        No posting can tell you these. Don&apos;t accept an offer with a must-have unanswered.
      </p>
      {INTERVIEW_QUESTIONS.map((q) => (
        <label key={q.key} style={{ display: "grid", gap: 6, fontSize: "var(--text-sm)" }}>
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {q.label}
            {q.mustHave && <Badge tone="accent">Must-have</Badge>}
          </span>
          <input
            value={values[q.key] ?? ""}
            onChange={(e) => setValues({ ...values, [q.key]: e.target.value })}
            style={{ font: "inherit", padding: "8px 10px", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)" }}
          />
        </label>
      ))}
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => run(() => setCompanyAnswers(companyId, values, postingId))}>
          Save answers
        </Button>
        <ActionMessage error={error} note={note} />
      </div>
    </div>
  );
}
