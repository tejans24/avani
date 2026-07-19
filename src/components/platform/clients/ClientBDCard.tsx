"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setClientStage, setClientNextAction, setClientDeal } from "@/actions/clients";
import { formatCents, dollarsToCents } from "@/lib/money";
import { formatDateLong } from "@/lib/dates";
import {
  CLIENT_STAGES,
  type ClientStage,
} from "@/lib/validations";
import {
  STAGE_LABEL,
  STAGE_BLURB,
  STAGE_CADENCE_DAYS,
  STAGE_CHECKLIST,
} from "@/lib/bd-playbook";
import { Badge, Eyebrow } from "@/components/platform/ds";
import { Field, Select, Input } from "@/components/form/shared";

const STAGE_TONE: Record<ClientStage, string> = {
  LEAD: "accent",
  PROSPECT: "caution",
  ACTIVE: "positive",
  PAST: "neutral",
};

function centsToDollarString(cents: number | null): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}

export function ClientBDCard({
  clientId,
  stage,
  nextActionNote,
  nextActionDueDateIso,
  dealValueCents,
  expectedCloseDateIso,
}: {
  clientId: string;
  stage: ClientStage;
  nextActionNote: string | null;
  nextActionDueDateIso: string | null;
  dealValueCents: number | null;
  expectedCloseDateIso: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [note, setNote] = useState(nextActionNote ?? "");
  const [due, setDue] = useState(nextActionDueDateIso ?? "");
  const [dealText, setDealText] = useState(centsToDollarString(dealValueCents));
  const [close, setClose] = useState(expectedCloseDateIso ?? "");

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong");
        return;
      }
      router.refresh();
    });
  };

  const cadence = STAGE_CADENCE_DAYS[stage];

  return (
    <div className="form-card" style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Eyebrow index="BD">Relationship</Eyebrow>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Badge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</Badge>
          <select
            aria-label="Stage"
            id="bd-stage"
            value={stage}
            disabled={pending}
            onChange={(e) => run(() => setClientStage(clientId, e.target.value as ClientStage))}
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
              padding: "6px 10px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-default)",
              background: "var(--warm-white)",
              color: "var(--ink)",
            }}
          >
            {CLIENT_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p style={{ margin: "10px 0 0", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
        {STAGE_BLURB[stage]}
      </p>

      {/* Next step */}
      <div style={{ marginTop: 20 }}>
        <div
          style={{
            fontSize: "var(--text-xs)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "var(--text-muted)",
            marginBottom: 8,
          }}
        >
          Next step
        </div>
        {nextActionNote ? (
          <p
            data-testid="bd-next-action"
            style={{ margin: "0 0 10px", fontSize: "var(--text-sm)", color: "var(--text-primary)" }}
          >
            {nextActionNote}
            {nextActionDueDateIso ? (
              <span style={{ color: "var(--text-muted)" }}> · due {formatDateLong(nextActionDueDateIso)}</span>
            ) : null}
          </p>
        ) : (
          <p style={{ margin: "0 0 10px", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
            No next step set. Deciding the next action is the whole game — set one.
          </p>
        )}
        <div className="form-grid">
          <Field label="What's the next step?" htmlFor="bd-note" className="span-2">
            <Input
              id="bd-note"
              value={note}
              placeholder="e.g. Send the proposal, book a follow-up call…"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNote(e.target.value)}
            />
          </Field>
          <Field label="Due" htmlFor="bd-due">
            <Input
              id="bd-due"
              type="date"
              value={due}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDue(e.target.value)}
            />
          </Field>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
            <button
              type="button"
              className="btn-inline-primary"
              disabled={pending}
              onClick={() =>
                run(() =>
                  setClientNextAction(clientId, {
                    nextActionNote: note,
                    nextActionDueDate: due || null,
                  })
                )
              }
              style={inlineBtn("primary")}
            >
              Save next step
            </button>
            {nextActionNote && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setNote("");
                  setDue("");
                  run(() =>
                    setClientNextAction(clientId, { nextActionNote: "", nextActionDueDate: null })
                  );
                }}
                style={inlineBtn("ghost")}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Deal */}
      <div style={{ marginTop: 20 }}>
        <div
          style={{
            fontSize: "var(--text-xs)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "var(--text-muted)",
            marginBottom: 8,
          }}
        >
          Deal
        </div>
        <div className="form-grid">
          <Field label="Estimated value ($)" htmlFor="bd-deal">
            <Input
              id="bd-deal"
              inputMode="decimal"
              value={dealText}
              placeholder="0.00"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDealText(e.target.value)}
            />
          </Field>
          <Field label="Expected close" htmlFor="bd-close">
            <Input
              id="bd-close"
              type="date"
              value={close}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClose(e.target.value)}
            />
          </Field>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(() =>
                  setClientDeal(clientId, {
                    dealValueCents: dealText.trim() === "" ? null : dollarsToCents(dealText),
                    expectedCloseDate: close || null,
                  })
                )
              }
              style={inlineBtn("primary")}
            >
              Save deal
            </button>
          </div>
        </div>
        {dealValueCents != null && (
          <p style={{ margin: "8px 0 0", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
            {formatCents(dealValueCents)}
            {expectedCloseDateIso ? ` · expected ${formatDateLong(expectedCloseDateIso)}` : ""}
          </p>
        )}
      </div>

      {/* Guidance */}
      <div
        style={{
          marginTop: 20,
          padding: "14px 16px",
          background: "var(--bone)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
        }}
      >
        <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-primary)" }}>
          Playbook · {STAGE_LABEL[stage]}
        </div>
        <p style={{ margin: "6px 0 8px", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
          {cadence == null
            ? "No active cadence at this stage."
            : `Suggested cadence: reach out at least every ${cadence} day${cadence === 1 ? "" : "s"}.`}
        </p>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
          To advance from here:
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {STAGE_CHECKLIST[stage].map((item) => (
              <li key={item} style={{ marginBottom: 2 }}>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {error && (
        <p role="alert" style={{ margin: "12px 0 0", fontSize: "var(--text-sm)", color: "var(--critical)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function inlineBtn(variant: "primary" | "ghost"): React.CSSProperties {
  return {
    fontFamily: "var(--font-sans)",
    fontSize: "var(--text-sm)",
    fontWeight: 500,
    padding: "9px 16px",
    borderRadius: "var(--radius-md)",
    cursor: "pointer",
    border: variant === "primary" ? "1px solid var(--clay)" : "1px solid var(--border-default)",
    background: variant === "primary" ? "var(--clay)" : "transparent",
    color: variant === "primary" ? "#FBF6EF" : "var(--text-secondary)",
    whiteSpace: "nowrap",
  };
}
