"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteJob, setJobArchived, setJobLane, setJobNextAction, setJobNotes, setJobStatus } from "@/actions/jobs";
import { Badge, Button, Eyebrow } from "@/components/platform/ds";
import { Field, Input, Select, Textarea } from "@/components/form/shared";
import { LANE_LABEL } from "@/lib/jobs/display";
import { JOB_STATUS_LABEL, STATUS_FOLLOW_UP, type JobStatus } from "@/lib/jobs/pipeline";
import type { Lane } from "@/lib/jobs/scoring-config";
import { ActionMessage, useAction } from "./useAction";

const STATUSES = Object.keys(JOB_STATUS_LABEL) as JobStatus[];

export function JobPipelineCard(props: {
  postingId: string;
  status: JobStatus;
  appliedOnIso: string | null;
  nextActionNote: string | null;
  nextActionDueIso: string | null;
  notes: string | null;
  tailoringNotes: string | null;
  lane: Lane;
  laneOverride: Lane | null;
  archived: boolean;
  deletable: boolean;
}) {
  const router = useRouter();
  const { pending, error, note, run } = useAction();
  const today = new Date().toISOString().slice(0, 10);
  const [status, setStatus] = useState<JobStatus>(props.status);
  const [statusDate, setStatusDate] = useState(today);
  const [statusNote, setStatusNote] = useState("");
  const [naNote, setNaNote] = useState(props.nextActionNote ?? "");
  const [naDue, setNaDue] = useState(props.nextActionDueIso ?? "");
  const [notes, setNotes] = useState(props.notes ?? "");
  const [tailoring, setTailoring] = useState(props.tailoringNotes ?? "");

  const followUp = STATUS_FOLLOW_UP[status];

  return (
    <div className="form-card" style={{ marginBottom: 28, display: "grid", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <Eyebrow index="01">Your pipeline</Eyebrow>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Badge tone="brand">{JOB_STATUS_LABEL[props.status]}</Badge>
          {props.appliedOnIso && <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>Applied {props.appliedOnIso}</span>}
        </div>
      </div>

      <div className="form-grid">
        <Field label="Status" htmlFor="job-status">
          <Select id="job-status" value={status} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatus(e.target.value as JobStatus)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {JOB_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date" htmlFor="job-status-date">
          <Input id="job-status-date" type="date" value={statusDate} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStatusDate(e.target.value)} />
        </Field>
        <Field label="Note (optional)" htmlFor="job-status-note" className="span-2">
          <Input
            id="job-status-note"
            value={statusNote}
            placeholder={status === "APPLIED" ? "e.g. applied via referral from J." : ""}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStatusNote(e.target.value)}
          />
        </Field>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={pending || (status === props.status && !statusNote)}
          onClick={() => run(() => setJobStatus(props.postingId, { status, note: statusNote || undefined, occurredOn: statusDate }), () => {
            setStatusNote("");
            router.refresh();
          })}
        >
          {status === "APPLIED" && props.status !== "APPLIED" ? "Mark applied" : "Update status"}
        </Button>
        {followUp && status !== props.status && (
          <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
            Sets a follow-up in {followUp.days} day{followUp.days === 1 ? "" : "s"}: {followUp.note}
          </span>
        )}
      </div>

      <div className="form-grid">
        <Field label="Next step" htmlFor="job-na-note">
          <Input id="job-na-note" value={naNote} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNaNote(e.target.value)} />
        </Field>
        <Field label="Due" htmlFor="job-na-due">
          <Input id="job-na-due" type="date" value={naDue} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNaDue(e.target.value)} />
        </Field>
      </div>
      <div>
        <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => run(() => setJobNextAction(props.postingId, { note: naNote, due: naDue }))}>
          Save next step
        </Button>
      </div>

      <Field label="Tailoring notes" htmlFor="job-tailoring" hint="What to emphasize for this job. Steers tailoring; never adds claims that aren't in your master résumé.">
        <Textarea id="job-tailoring" rows={3} value={tailoring} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTailoring(e.target.value)} />
      </Field>
      <Field label="Notes" htmlFor="job-notes">
        <Textarea id="job-notes" rows={4} value={notes} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)} />
      </Field>
      <div>
        <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => run(() => setJobNotes(props.postingId, { notes, tailoringNotes: tailoring }))}>
          Save notes
        </Button>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid var(--border-subtle)", paddingTop: 16 }}>
        <label htmlFor="job-lane" style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
          Lane
        </label>
        <select
          id="job-lane"
          value={props.laneOverride ?? ""}
          disabled={pending}
          onChange={(e) => run(() => setJobLane(props.postingId, (e.target.value || null) as Lane | null))}
        >
          <option value="">Auto ({LANE_LABEL[props.lane]})</option>
          {(Object.keys(LANE_LABEL) as Lane[]).map((l) => (
            <option key={l} value={l}>
              {LANE_LABEL[l]}
            </option>
          ))}
        </select>
        <span style={{ flex: 1 }} />
        <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => run(() => setJobArchived(props.postingId, !props.archived))}>
          {props.archived ? "Restore" : "Archive"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending || !props.deletable}
          title={props.deletable ? "Delete permanently; refreshes won't bring it back" : "Applied jobs can only be archived"}
          onClick={() => {
            if (!window.confirm("Delete this job permanently? It won't come back on refresh.")) return;
            run(() => deleteJob(props.postingId), () => {
              router.push("/jobs");
              router.refresh();
            });
          }}
        >
          Delete
        </Button>
      </div>
      <ActionMessage error={error} note={note} />
    </div>
  );
}
