"use client";

import { useState } from "react";
import { setCompanyBenefits } from "@/actions/jobs";
import { Badge, Button, Eyebrow } from "@/components/platform/ds";
import { BENEFITS, type BenefitKey, type MergedBenefit } from "@/lib/jobs/benefits";
import { ActionMessage, useAction } from "./useAction";

const SOURCE_LABEL = { you: "From you", posted: "In this posting", "company-wide": "From another posting" } as const;

export function BenefitsPanel({
  companyId,
  postingId,
  merged,
  owner,
}: {
  companyId: string;
  postingId: string;
  merged: MergedBenefit[];
  owner: Partial<Record<BenefitKey, { value?: string; note?: string }>>;
}) {
  const { pending, error, note, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(owner);

  return (
    <div className="form-card" style={{ marginBottom: 28, display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Eyebrow index="02">Benefits</Eyebrow>
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(!editing)}>
          {editing ? "Done" : "Add what a recruiter told you"}
        </Button>
      </div>
      {merged.length === 0 ? (
        <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>No benefits stated in any posting from this company yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {merged.map((b) => (
            <li key={b.key} style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: "var(--text-sm)", flexWrap: "wrap" }}>
              <Badge tone={b.source === "you" ? "brand" : "neutral"}>{b.value ? `${b.label} · ${b.value}` : b.label}</Badge>
              <span style={{ color: "var(--text-muted)" }}>{SOURCE_LABEL[b.source]}:</span>
              <span style={{ color: "var(--text-secondary)", flex: 1, minWidth: 200 }}>{b.evidence}</span>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <div style={{ display: "grid", gap: 8 }}>
          {BENEFITS.map((b) => (
            <div key={b.key} style={{ display: "grid", gridTemplateColumns: "160px 1fr 1fr", gap: 8, alignItems: "center", fontSize: "var(--text-sm)" }}>
              <span>{b.label}</span>
              <input
                aria-label={`${b.label} value`}
                placeholder="e.g. 6% match"
                value={values[b.key]?.value ?? ""}
                onChange={(e) => setValues({ ...values, [b.key]: { ...values[b.key], value: e.target.value } })}
                style={{ font: "inherit", padding: "6px 8px", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)" }}
              />
              <input
                aria-label={`${b.label} note`}
                placeholder="Source, e.g. recruiter call 10/4"
                value={values[b.key]?.note ?? ""}
                onChange={(e) => setValues({ ...values, [b.key]: { ...values[b.key], note: e.target.value } })}
                style={{ font: "inherit", padding: "6px 8px", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)" }}
              />
            </div>
          ))}
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => run(() => setCompanyBenefits(companyId, values as Record<string, { value?: string; note?: string }>, postingId))}
            >
              Save benefits
            </Button>
            <ActionMessage error={error} note={note} />
          </div>
        </div>
      )}
    </div>
  );
}
