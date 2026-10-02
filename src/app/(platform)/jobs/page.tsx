import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { Badge, Button } from "@/components/platform/ds";
import { StatTile } from "@/components/platform/StatTile";
import type { ExtractedBenefit } from "@/lib/jobs/benefits";
import { LANE_LABEL, WORK_MODE_LABEL, ago, formatComp, scoreTone } from "@/lib/jobs/display";
import { JOB_STATUS_LABEL, type JobStatus } from "@/lib/jobs/pipeline";
import type { Lane, WorkMode } from "@/lib/jobs/scoring-config";

export const metadata = { title: "Jobs — Avani" };
export const dynamic = "force-dynamic";

const VIEWS = {
  matches: { label: "Matches", blurb: "Open postings that pass your filters, best first." },
  pipeline: { label: "Pipeline", blurb: "Shortlisted, applied, interviewing and offers." },
  filtered: { label: "Filtered out", blurb: "Postings that failed a must-have. Each shows why." },
  skipped: { label: "Skipped", blurb: "Postings you passed on." },
  archived: { label: "Archived", blurb: "Hidden but kept, with their history." },
} as const;
type View = keyof typeof VIEWS;

const STATUS_TONE: Record<JobStatus, string> = {
  NEW: "neutral",
  SHORTLISTED: "brand",
  APPLIED: "accent",
  INTERVIEWING: "caution",
  OFFER: "positive",
  CLOSED: "neutral",
  SKIPPED: "neutral",
};

function whereFor(view: View, lane: Lane | null): Prisma.JobPostingWhereInput {
  const base: Prisma.JobPostingWhereInput = lane ? { lane } : {};
  switch (view) {
    case "matches":
      return { ...base, archivedAt: null, closedAt: null, filterFailures: { isEmpty: true }, status: { in: ["NEW", "SHORTLISTED"] } };
    case "pipeline":
      return { ...base, archivedAt: null, status: { in: ["SHORTLISTED", "APPLIED", "INTERVIEWING", "OFFER"] } };
    case "filtered":
      return { ...base, archivedAt: null, NOT: { filterFailures: { isEmpty: true } }, status: "NEW" };
    case "skipped":
      return { ...base, archivedAt: null, status: "SKIPPED" };
    case "archived":
      return { ...base, archivedAt: { not: null } };
  }
}

export default async function JobsPage({ searchParams }: { searchParams: { view?: string; lane?: string } }) {
  const view: View = (Object.keys(VIEWS) as View[]).includes(searchParams.view as View) ? (searchParams.view as View) : "matches";
  const lane = (Object.keys(LANE_LABEL) as Lane[]).includes(searchParams.lane as Lane) ? (searchParams.lane as Lane) : null;
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);

  const [postings, counts, newThisWeek, failingBoards, boardCount] = await Promise.all([
    db.jobPosting.findMany({
      where: whereFor(view, lane),
      orderBy: view === "pipeline" ? [{ statusChangedAt: "desc" }] : [{ score: { sort: "desc", nulls: "last" } }, { firstSeenAt: "desc" }],
      take: 300,
      include: { company: { select: { name: true } }, _count: { select: { aliases: true } } },
    }),
    db.jobPosting.groupBy({ by: ["status"], where: { archivedAt: null }, _count: true }),
    db.jobPosting.count({ where: { firstSeenAt: { gte: weekAgo }, filterFailures: { isEmpty: true }, archivedAt: null } }),
    db.jobBoard.count({ where: { enabled: true, lastError: { not: null } } }),
    db.jobBoard.count({ where: { enabled: true } }),
  ]);
  const countOf = (s: JobStatus) => counts.find((c) => c.status === s)?._count ?? 0;

  const href = (v: View, l: Lane | null = lane) => `/jobs?view=${v}${l ? `&lane=${l}` : ""}`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Jobs</h1>
          <p className="sub">{VIEWS[view].blurb} Nothing here is ever submitted for you.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Button href="/jobs/awards" variant="secondary" size="md">
            Awards
          </Button>
          <Button href="/jobs/resume" variant="secondary" size="md">
            Résumé
          </Button>
          <Button href="/jobs/boards" variant="secondary" size="md">
            Boards
          </Button>
          <Button href="/jobs/capture" variant="primary" size="md">
            Add a job
          </Button>
        </div>
      </div>

      <div className="stat-row">
        <StatTile label="New matches" value={String(newThisWeek)} sublabel="Passing filters, last 7 days" />
        <StatTile label="Applied" value={String(countOf("APPLIED"))} sublabel="Waiting to hear back" />
        <StatTile label="Interviewing" value={String(countOf("INTERVIEWING"))} tone={countOf("INTERVIEWING") ? "positive" : "default"} />
        <StatTile
          label="Boards"
          value={`${boardCount - failingBoards}/${boardCount}`}
          sublabel={failingBoards ? `${failingBoards} failing` : "All fetching"}
          tone={failingBoards ? "critical" : "default"}
        />
      </div>

      <div className="filter-tabs">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Link key={v} href={href(v)} data-active={view === v || undefined}>
            {VIEWS[v].label}
          </Link>
        ))}
      </div>
      <div className="filter-tabs" style={{ marginTop: -8 }} aria-label="Lane">
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

      {postings.length === 0 ? (
        <div className="empty-state">
          <p className="empty-title">Nothing here yet</p>
          <p>
            {boardCount === 0
              ? "Add job boards to start pulling postings, or add a job you found yourself."
              : "New postings arrive as boards refresh through the day."}
          </p>
          <div className="empty-actions">
            <Button href={boardCount === 0 ? "/jobs/boards" : "/jobs/capture"} variant="primary" size="sm">
              {boardCount === 0 ? "Add boards" : "Add a job"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th className="num">Score</th>
                <th>Role</th>
                <th>Lane</th>
                <th>Where</th>
                <th>Pay</th>
                <th>Benefits</th>
                <th>Posted</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {postings.map((p) => {
                const passed = p.filterFailures.length === 0;
                const benefits = (p.benefits as unknown as ExtractedBenefit[]).slice(0, 4);
                const comp = formatComp(p.compMinCents, p.compMaxCents);
                return (
                  <tr key={p.id} data-testid="job-row">
                    <td className="num">
                      <Badge tone={scoreTone(p.score, passed)}>{p.score ?? "—"}</Badge>
                    </td>
                    <td>
                      <Link href={`/jobs/${p.id}`}>{p.title}</Link>
                      <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
                        {p.company.name}
                        {p._count.aliases ? ` · also on ${p._count.aliases} other board${p._count.aliases === 1 ? "" : "s"}` : ""}
                        {p.closedAt ? " · no longer listed" : ""}
                      </div>
                      {!passed && (
                        <div style={{ fontSize: "var(--text-sm)", color: "var(--critical)" }}>{p.filterFailures[0]}</div>
                      )}
                    </td>
                    <td style={{ fontSize: "var(--text-sm)" }}>{LANE_LABEL[p.lane as Lane]}</td>
                    <td style={{ fontSize: "var(--text-sm)" }}>
                      {WORK_MODE_LABEL[p.workMode as WorkMode]}
                      <div style={{ color: "var(--text-muted)" }}>{p.location}</div>
                    </td>
                    <td style={{ fontSize: "var(--text-sm)", whiteSpace: "nowrap" }}>
                      {comp ?? <span style={{ color: "var(--text-muted)" }}>Not posted</span>}
                    </td>
                    <td>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxWidth: 260 }}>
                        {benefits.length === 0 ? (
                          <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>—</span>
                        ) : (
                          benefits.map((b) => (
                            <Badge key={b.key} tone="neutral" title={b.evidence}>
                              {b.value ? `${b.label} · ${b.value}` : b.label}
                            </Badge>
                          ))
                        )}
                      </div>
                    </td>
                    <td style={{ fontSize: "var(--text-sm)", whiteSpace: "nowrap" }}>{ago(p.postedAt ?? p.firstSeenAt)}</td>
                    <td>
                      <Badge tone={STATUS_TONE[p.status as JobStatus]}>{JOB_STATUS_LABEL[p.status as JobStatus]}</Badge>
                    </td>
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
