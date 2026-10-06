import Link from "next/link";
import { db } from "@/lib/db";
import { Badge, Button } from "@/components/platform/ds";
import { EvaluateMatchesButton } from "@/components/platform/jobs/EvaluateMatchesButton";
import { LANE_LABEL, WORK_MODE_LABEL, ago, formatComp, postingSiteLabel, scoreTone } from "@/lib/jobs/display";
import { APPLYING_VERDICTS, FIT_VERDICT_LABEL, PACE_LABEL, paceOf, type FitAnalysis, type Pace } from "@/lib/jobs/fit";
import { JOB_STATUS_LABEL, type JobStatus } from "@/lib/jobs/pipeline";
import type { BreakdownEntry } from "@/lib/jobs/scoring";
import type { Lane, WorkMode } from "@/lib/jobs/scoring-config";
import { UNEVALUATED_MATCH, VIEWS, parseView, triageKey, verdictBucket, viewWhere, type View } from "@/lib/jobs/views";

export const metadata = { title: "Jobs — Avani" };
export const dynamic = "force-dynamic";
// "Have Claude read the next few" runs as a server action on this page.
export const maxDuration = 300;

const STATUS_TONE: Record<JobStatus, string> = {
  NEW: "neutral",
  SHORTLISTED: "brand",
  APPLIED: "accent",
  INTERVIEWING: "caution",
  OFFER: "positive",
  CLOSED: "neutral",
  SKIPPED: "neutral",
};
const PACE_TONE: Record<Pace, string> = { CALM: "positive", STEADY: "neutral", INTENSE: "critical", UNKNOWN: "neutral" };

/** Work-mode filter for the list ("Remote" includes remote jobs with occasional travel, which are flagged). */
const MODES = {
  remote: { label: "Remote", modes: ["REMOTE"] },
  occasional: { label: "Occasional office days", modes: ["OCCASIONAL_HYBRID"] },
  unknown: { label: "Not stated", modes: ["UNKNOWN"] },
  hybrid: { label: "Hybrid", modes: ["HYBRID"] },
  onsite: { label: "On-site", modes: ["ONSITE"] },
} as const satisfies Record<string, { label: string; modes: WorkMode[] }>;
type Mode = keyof typeof MODES;

export default async function JobsPage({ searchParams }: { searchParams: { view?: string; lane?: string; mode?: string } }) {
  const view: View = parseView(searchParams.view);
  const lane = (Object.keys(LANE_LABEL) as Lane[]).includes(searchParams.lane as Lane) ? (searchParams.lane as Lane) : null;
  const mode = (Object.keys(MODES) as Mode[]).includes(searchParams.mode as Mode) ? (searchParams.mode as Mode) : null;
  const narrow = { ...(lane ? { lane } : {}), ...(mode ? { workMode: { in: [...MODES[mode].modes] } } : {}) };

  const [rows, unevaluated, failingBoards, boardCount, hasMaster] = await Promise.all([
    db.jobPosting.findMany({
      where: { AND: [viewWhere(view), narrow] },
      orderBy: view === "applied" ? [{ statusChangedAt: "desc" }] : [{ score: { sort: "desc", nulls: "last" } }, { firstSeenAt: "desc" }],
      take: 300,
      include: { company: { select: { name: true } } },
    }),
    db.jobPosting.count({ where: UNEVALUATED_MATCH }),
    db.jobBoard.count({ where: { enabled: true, lastError: { not: null } } }),
    db.jobBoard.count({ where: { enabled: true } }),
    db.resumeMaster.count(),
  ]);

  // "To apply" and "Not for me" share the open matches; Claude's verdict decides which side each lands on.
  const postings =
    view === "todo"
      ? rows.filter((p) => verdictBucket(p).bucket === "todo").sort((a, b) => triageKey(a) - triageKey(b))
      : view === "notforme"
        ? rows.filter((p) => verdictBucket(p).bucket === "notforme")
        : rows;
  const aiEnabled = Boolean(process.env.ANTHROPIC_API_KEY) || process.env.TAILOR_MODE === "fake";

  const href = (v: View, l: Lane | null = lane, m: Mode | null = mode) => `/jobs?view=${v}${l ? `&lane=${l}` : ""}${m ? `&mode=${m}` : ""}`;
  const muted = { fontSize: "var(--text-sm)", color: "var(--text-muted)" } as const;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Jobs</h1>
          <p className="sub">
            {VIEWS[view].blurb} Nothing is ever submitted for you.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {view === "todo" && aiEnabled && hasMaster > 0 && <EvaluateMatchesButton remaining={unevaluated} />}
          <Button href="/jobs/capture" variant="primary" size="md">
            Add a job
          </Button>
        </div>
      </div>

      {failingBoards > 0 && (
        <p style={{ ...muted, color: "var(--critical)", marginTop: -8 }}>
          {failingBoards} of {boardCount} sources failed to refresh. <Link href="/jobs/boards">See sources</Link>
        </p>
      )}

      <div className="filter-tabs">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Link key={v} href={href(v)} data-active={view === v || undefined}>
            {VIEWS[v].label}
          </Link>
        ))}
      </div>
      <div className="quick-filters" aria-label="Quick filters">
        <Link href={href(view, lane, mode === "remote" ? null : "remote")} data-active={mode === "remote" || undefined} aria-pressed={mode === "remote"}>
          Remote only
        </Link>
        <Link
          href={href(view, lane === "GOV_CONTRACTOR" ? null : "GOV_CONTRACTOR", mode)}
          data-active={lane === "GOV_CONTRACTOR" || undefined}
          aria-pressed={lane === "GOV_CONTRACTOR"}
        >
          Gov contracting only
        </Link>
        <details className="more-filters" open={Boolean((lane && lane !== "GOV_CONTRACTOR") || (mode && mode !== "remote")) || undefined}>
          <summary>More filters</summary>
          <div className="filter-tabs" aria-label="Lane">
            <Link href={href(view, null)} data-active={!lane || undefined}>
              All lanes
            </Link>
            {(Object.keys(LANE_LABEL) as Lane[])
              .filter((l) => l !== "UNCLASSIFIED")
              .map((l) => (
                <Link key={l} href={href(view, l)} data-active={lane === l || undefined}>
                  {LANE_LABEL[l]}
                </Link>
              ))}
          </div>
          <div className="filter-tabs" aria-label="Work mode">
            <Link href={href(view, lane, null)} data-active={!mode || undefined}>
              All work modes
            </Link>
            {(Object.keys(MODES) as Mode[]).map((m) => (
              <Link key={m} href={href(view, lane, m)} data-active={mode === m || undefined}>
                {MODES[m].label}
              </Link>
            ))}
          </div>
        </details>
      </div>

      {postings.length === 0 ? (
        <div className="empty-state">
          <p className="empty-title">{view === "todo" ? "Nothing worth applying to right now" : "Nothing here"}</p>
          <p>
            {boardCount === 0
              ? "Add sources to start pulling postings, or add a job you found yourself."
              : view === "todo"
                ? "New postings arrive as sources refresh. Anything ruled out is under Not for me."
                : "Postings land here as you work through them."}
          </p>
          <div className="empty-actions">
            <Button href={boardCount === 0 ? "/jobs/boards" : "/jobs/capture"} variant="primary" size="sm">
              {boardCount === 0 ? "Add sources" : "Add a job"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="data-table job-table">
            <thead>
              <tr>
                <th>Verdict</th>
                <th>Role</th>
                <th>Pay</th>
                <th>Pace</th>
                <th>Where</th>
                {view === "applied" ? <th>Status</th> : <th>Posted</th>}
              </tr>
            </thead>
            <tbody>
              {postings.map((p) => {
                const fit = p.fitAnalysis as unknown as FitAnalysis | null;
                const passed = p.filterFailures.length === 0;
                const pace = paceOf(fit, p.scoreBreakdown as unknown as BreakdownEntry[]);
                const comp = formatComp(p.compMinCents, p.compMaxCents);
                const why = view === "notforme" ? verdictBucket(p).why : null;
                const applying = fit && APPLYING_VERDICTS.includes(fit.verdict);
                return (
                  <tr key={p.id} data-testid="job-row">
                    <td className="c-score">
                      {fit ? (
                        <Badge tone={applying ? (fit.verdict === "APPLY" ? "positive" : "caution") : "neutral"}>{FIT_VERDICT_LABEL[fit.verdict]}</Badge>
                      ) : (
                        <Badge tone={scoreTone(p.score, passed)} title="Score from the app's rules; Claude hasn't read it yet">
                          {p.score ?? "—"}
                        </Badge>
                      )}
                      <div style={{ ...muted, marginTop: 4, whiteSpace: "nowrap" }}>{fit ? `score ${p.score ?? "—"}` : "not read yet"}</div>
                    </td>
                    <td className="c-role">
                      <Link href={`/jobs/${p.id}`}>{p.title}</Link>
                      <div style={muted}>
                        {p.company.name} · {postingSiteLabel(p)}
                        {p.closedAt ? " · no longer listed" : ""}
                      </div>
                      {why && <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>{why}</div>}
                      {fit && applying && view === "todo" && <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>{fit.reason}</div>}
                    </td>
                    <td className="c-pay" style={{ fontSize: "var(--text-sm)", whiteSpace: "nowrap" }}>
                      {comp ?? <span style={{ color: "var(--text-muted)" }}>Not posted</span>}
                    </td>
                    <td className="c-pace" style={{ fontSize: "var(--text-sm)" }} data-empty={pace.rating === "UNKNOWN" || undefined}>
                      {pace.rating === "UNKNOWN" ? (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      ) : (
                        <Badge tone={PACE_TONE[pace.rating]} title={pace.why}>
                          {PACE_LABEL[pace.rating]}
                        </Badge>
                      )}
                    </td>
                    <td className="c-where" style={{ fontSize: "var(--text-sm)" }}>
                      {WORK_MODE_LABEL[p.workMode as WorkMode]}
                      <div style={{ color: "var(--text-muted)" }}>{p.location}</div>
                    </td>
                    {view === "applied" ? (
                      <td className="c-status">
                        <Badge tone={STATUS_TONE[p.status as JobStatus]}>{JOB_STATUS_LABEL[p.status as JobStatus]}</Badge>
                      </td>
                    ) : (
                      <td className="c-posted" style={{ fontSize: "var(--text-sm)", whiteSpace: "nowrap" }}>
                        {ago(p.postedAt ?? p.firstSeenAt)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
