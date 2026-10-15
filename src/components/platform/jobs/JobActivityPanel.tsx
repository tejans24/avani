"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addJobActivity, deleteJobActivity } from "@/actions/jobs";
import { Button, Eyebrow } from "@/components/platform/ds";
import { Field, Input, Select, Textarea } from "@/components/form/shared";
import { JOB_STATUS_LABEL, type JobStatus } from "@/lib/jobs/pipeline";
import { ActionMessage, useAction } from "./useAction";

const KIND_LABEL: Record<string, string> = {
  STATUS_CHANGE: "Status",
  INTERVIEW: "Interview",
  RECRUITER_CONTACT: "Recruiter",
  FOLLOW_UP: "Follow-up",
  NOTE: "Note",
};

export type ActivityItem = {
  id: string;
  kind: string;
  occurredOnIso: string;
  note: string | null;
  fromStatus: JobStatus | null;
  toStatus: JobStatus | null;
};

export function JobActivityPanel({ postingId, items }: { postingId: string; items: ActivityItem[] }) {
  const router = useRouter();
  const { pending, error, run } = useAction();
  const today = new Date().toISOString().slice(0, 10);
  const [kind, setKind] = useState<"INTERVIEW" | "RECRUITER_CONTACT" | "FOLLOW_UP" | "NOTE">("INTERVIEW");
  const [on, setOn] = useState(today);
  const [text, setText] = useState("");
  const [naNote, setNaNote] = useState("");
  const [naDue, setNaDue] = useState("");

  return (
    <div className="form-card" style={{ marginBottom: 28, display: "grid", gap: 14 }}>
      <Eyebrow index="04">Activity</Eyebrow>
      <div className="form-grid">
        <Field label="Type" htmlFor="act-kind">
          <Select id="act-kind" value={kind} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setKind(e.target.value as typeof kind)}>
            <option value="INTERVIEW">Interview</option>
            <option value="RECRUITER_CONTACT">Recruiter contact</option>
            <option value="FOLLOW_UP">Follow-up sent</option>
            <option value="NOTE">Note</option>
          </Select>
        </Field>
        <Field label="Date" htmlFor="act-on">
          <Input id="act-on" type="date" value={on} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOn(e.target.value)} />
        </Field>
        <Field label="What happened" htmlFor="act-note" className="span-2">
          <Textarea id="act-note" rows={3} value={text} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)} />
        </Field>
        <Field label="Next step (optional)" htmlFor="act-na-note">
          <Input id="act-na-note" value={naNote} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNaNote(e.target.value)} />
        </Field>
        <Field label="Due" htmlFor="act-na-due">
          <Input id="act-na-due" type="date" value={naDue} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNaDue(e.target.value)} />
        </Field>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={pending || !text.trim()}
          onClick={() =>
            run(() => addJobActivity(postingId, { kind, note: text, occurredOn: on, nextActionNote: naNote, nextActionDue: naDue }), () => {
              setText("");
              setNaNote("");
              setNaDue("");
              router.refresh();
            })
          }
        >
          Log it
        </Button>
        <ActionMessage error={error} />
      </div>

      {items.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
          {items.map((a) => (
            <li key={a.id} className="activity-row" style={{ display: "flex", gap: 12, alignItems: "baseline", fontSize: "var(--text-sm)" }}>
              <span style={{ color: "var(--text-muted)", minWidth: 92 }}>{a.occurredOnIso}</span>
              <strong style={{ minWidth: 80 }}>{KIND_LABEL[a.kind] ?? a.kind}</strong>
              <span style={{ flex: 1 }}>
                {a.kind === "STATUS_CHANGE" && a.toStatus
                  ? `${a.fromStatus ? JOB_STATUS_LABEL[a.fromStatus] : "New"} → ${JOB_STATUS_LABEL[a.toStatus]}${a.note ? `: ${a.note}` : ""}`
                  : a.note}
              </span>
              {a.kind !== "STATUS_CHANGE" && (
                <button
                  type="button"
                  aria-label="Delete entry"
                  disabled={pending}
                  onClick={() => run(() => deleteJobActivity(postingId, a.id))}
                  style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
