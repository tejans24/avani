"use client";

import { setJobStatus } from "@/actions/jobs";
import { Badge, Button, Eyebrow } from "@/components/platform/ds";
import { APPLYING_VERDICTS, FIT_VERDICT_LABEL, type FitVerdict } from "@/lib/jobs/fit";
import type { JobStatus } from "@/lib/jobs/pipeline";
import { ActionMessage, useAction } from "./useAction";

const small = { fontSize: "var(--text-sm)" } as const;
const muted = { ...small, color: "var(--text-muted)" } as const;

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children: React.ReactNode }) {
  return (
    <li className="job-step" data-done={done || undefined}>
      <span className="job-step-mark" aria-hidden>
        {done ? "✓" : n}
      </span>
      <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
        <strong style={small}>
          {title}
          {done && <span className="sr-only"> (done)</span>}
        </strong>
        {children}
      </div>
    </li>
  );
}

/**
 * The job page's path from "is this worth it?" to "applied": one card, one
 * obvious next action at each step. The app never submits anything; "Mark
 * applied" only records that you did.
 */
export function JobSteps(props: {
  postingId: string;
  postingUrl: string;
  status: JobStatus;
  appliedOnIso: string | null;
  verdict: FitVerdict | null;
  /** Filtered out by a must-have (the evaluator doesn't run on its own then). */
  filteredOut: boolean;
  /** Not remote: Claude only evaluates it when asked. */
  notRemote: boolean;
  resume: { versions: number; latest: number | null; sent: number | null };
  coverLetter: { needed: boolean; why: string } | null;
  answers: { total: number; ready: number };
}) {
  const { pending, error, run } = useAction();
  const applying = props.verdict !== null && APPLYING_VERDICTS.includes(props.verdict);
  const ruledOut = props.filteredOut || (props.verdict !== null && !applying);
  const applied = props.appliedOnIso !== null || ["APPLIED", "INTERVIEWING", "OFFER"].includes(props.status);
  const skipped = props.status === "SKIPPED";
  const resumeHref = `/jobs/${props.postingId}/tailor${props.resume.versions ? "" : "?auto=1"}`;

  return (
    <div className="form-card job-steps" data-testid="job-steps">
      <Eyebrow index="→">Your next step</Eyebrow>
      <ol className="job-step-list">
        <Step n={1} done={props.verdict !== null} title="Worth applying?">
          {props.verdict ? (
            <span style={small}>
              Claude says <Badge tone={applying ? "positive" : "neutral"}>{FIT_VERDICT_LABEL[props.verdict]}</Badge>
            </span>
          ) : props.filteredOut ? (
            <span style={muted}>Filtered out by a must-have (see above). Evaluate it anyway if that&apos;s wrong.</span>
          ) : props.notRemote ? (
            <span style={muted}>Not remote, so Claude waits for you: Evaluate it if it&apos;s worth a look.</span>
          ) : (
            <span style={muted}>Waiting for Claude&apos;s read.</span>
          )}
        </Step>

        <Step n={2} done={props.resume.versions > 0} title="Résumé">
          {props.resume.versions > 0 ? (
            <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={muted}>
                Version {props.resume.latest} ready{props.resume.sent ? ` · v${props.resume.sent} sent` : ""}
              </span>
              <Button href={`/jobs/${props.postingId}/tailor`} variant="secondary" size="sm">
                Open résumé
              </Button>
            </span>
          ) : (
            <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Button href={resumeHref} variant={ruledOut ? "ghost" : "primary"} size="sm">
                {ruledOut ? "Make one anyway" : "Make my résumé"}
              </Button>
              <span style={muted}>Claude picks and rewords your best bullets for this posting, fitted to your page limit.</span>
            </span>
          )}
        </Step>

        <Step n={3} done={props.coverLetter !== null && !props.coverLetter.needed} title="Cover letter">
          {props.coverLetter ? (
            props.coverLetter.needed ? (
              <span style={small}>
                Worth writing: {props.coverLetter.why}{" "}
                {props.resume.versions > 0 && <a href={`/jobs/${props.postingId}/tailor#cover-letter`}>Write it</a>}
              </span>
            ) : (
              <span style={muted}>Not needed. {props.coverLetter.why}</span>
            )
          ) : (
            <span style={muted}>Only if the form asks for one.</span>
          )}
        </Step>

        <Step n={4} done={props.answers.total > 0 && props.answers.ready === props.answers.total} title="Application answers">
          <span style={muted}>
            {props.answers.total ? `${props.answers.ready} of ${props.answers.total} ready. ` : "Paste the form's questions and they're filled in for you. "}
            <a href="#answers">{props.answers.total ? "Review them" : "Add questions"}</a>
          </span>
        </Step>

        <Step n={5} done={applied} title="Apply">
          {applied ? (
            <span style={muted}>Applied{props.appliedOnIso ? ` ${props.appliedOnIso}` : ""}. A follow-up reminder is set.</span>
          ) : (
            <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Button href={props.postingUrl} target="_blank" rel="noreferrer" variant="secondary" size="sm">
                Open the posting
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setJobStatus(props.postingId, { status: "APPLIED" }))}>
                Mark applied
              </Button>
            </span>
          )}
        </Step>
      </ol>

      {!applied && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid var(--border-subtle)", paddingTop: 12 }}>
          {skipped ? (
            <>
              <span style={muted}>You skipped this job.</span>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setJobStatus(props.postingId, { status: "NEW" }))}>
                Undo
              </Button>
            </>
          ) : (
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setJobStatus(props.postingId, { status: "SKIPPED" }))}>
              Not for me: skip it
            </Button>
          )}
          <ActionMessage error={error} />
        </div>
      )}
    </div>
  );
}
