import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Badge, Button, Eyebrow } from "@/components/platform/ds";
import { BenefitsPanel } from "@/components/platform/jobs/BenefitsPanel";
import { FitPanel } from "@/components/platform/jobs/FitPanel";
import { CompanyCallChecklist } from "@/components/platform/jobs/CompanyCallChecklist";
import { JobActivityPanel } from "@/components/platform/jobs/JobActivityPanel";
import { JobPipelineCard } from "@/components/platform/jobs/JobPipelineCard";
import { dateToIso } from "@/lib/dates";
import { formatAwardAmount, isCurrentAward } from "@/lib/jobs/awards";
import { mergeBenefits, type BenefitKey, type ExtractedBenefit } from "@/lib/jobs/benefits";
import { canDeletePosting } from "@/lib/jobs/dedupe";
import { CATEGORY_LABEL, LANE_LABEL, SOURCE_LABEL, WORK_MODE_LABEL, ago, formatComp, postingSiteLabel, postingSourceText, scoreTone } from "@/lib/jobs/display";
import type { FitAnalysis } from "@/lib/jobs/fit";
import { resumeSchema } from "@/lib/jobs/resume-schema";
import type { JobStatus } from "@/lib/jobs/pipeline";
import { CATEGORY_CAPS, type Category, type Lane, type WorkMode } from "@/lib/jobs/scoring-config";
import type { BreakdownEntry } from "@/lib/jobs/scoring";

export const metadata = { title: "Job — Avani" };
export const dynamic = "force-dynamic";
// The fit evaluation (a server action on this page) takes a minute or more.
export const maxDuration = 300;

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  const posting = await db.jobPosting.findUnique({
    where: { id: params.id },
    include: {
      company: { include: { awards: { orderBy: { amountCents: { sort: "desc", nulls: "last" } }, take: 8 } } },
      aliases: { orderBy: { firstSeenAt: "asc" } },
      activity: { orderBy: { occurredAt: "desc" } },
      _count: { select: { tailored: true } },
    },
  });
  if (!posting) notFound();

  const siblings = await db.jobPosting.findMany({
    where: { companyId: posting.companyId, id: { not: posting.id } },
    select: { benefits: true },
  });
  const ownerBenefits = (posting.company.benefits ?? {}) as Partial<Record<BenefitKey, { value?: string; note?: string }>>;
  const merged = mergeBenefits({
    owner: ownerBenefits,
    posting: posting.benefits as unknown as ExtractedBenefit[],
    company: siblings.flatMap((s) => s.benefits as unknown as ExtractedBenefit[]),
  });

  const breakdown = posting.scoreBreakdown as unknown as BreakdownEntry[];
  const passed = posting.filterFailures.length === 0;
  const comp = formatComp(posting.compMinCents, posting.compMaxCents);
  const categories = Object.keys(CATEGORY_CAPS) as Category[];

  const fit = posting.fitAnalysis as unknown as FitAnalysis | null;
  const master = await db.resumeMaster.findFirst({ orderBy: { version: "desc" }, select: { data: true } });
  const parsedMaster = master ? resumeSchema.safeParse(master.data) : null;
  const cited = new Set(fit?.fitTable.flatMap((r) => r.bulletIds) ?? []);
  const bulletText: Record<string, string> = {};
  if (parsedMaster?.success) {
    for (const b of [...parsedMaster.data.experience.flatMap((e) => e.bullets), ...parsedMaster.data.projects.flatMap((p) => p.bullets)]) {
      if (cited.has(b.id)) bulletText[b.id] = b.text;
    }
  }
  const aiEnabled = Boolean(process.env.ANTHROPIC_API_KEY) || process.env.TAILOR_MODE === "fake";

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub" style={{ marginBottom: 6 }}>
            <Link href="/jobs">Jobs</Link> / {posting.company.name}
          </p>
          <h1>{posting.title}</h1>
          <p className="sub">
            {posting.company.name} · {WORK_MODE_LABEL[posting.workMode as WorkMode]} · {posting.location}
            {comp ? ` · ${comp}` : ""} · posted {ago(posting.postedAt ?? posting.firstSeenAt)}
            {posting.archivedAt ? " · archived" : ""}
            {posting.closedAt ? " · no longer listed" : ""}
          </p>
          <p className="sub" style={{ fontSize: "var(--text-sm)" }}>
            {postingSourceText(posting)}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Badge tone={scoreTone(posting.score, passed)} style={{ fontSize: "var(--text-lg)", padding: "6px 12px" }}>
            {posting.score ?? "—"}
          </Badge>
          <Button href={posting.url} target="_blank" rel="noreferrer" variant="secondary" size="md">
            Open posting
          </Button>
          <Button href={`/jobs/${posting.id}/tailor`} variant="primary" size="md">
            Tailor résumé{posting._count.tailored ? ` (${posting._count.tailored})` : ""}
          </Button>
        </div>
      </div>

      {!passed && (
        <div style={{ marginBottom: 20 }}>
          <div
            role="note"
            style={{
              borderLeft: "3px solid var(--critical)",
              background: "#F2DCD7",
              padding: "12px 16px",
              borderRadius: "var(--radius-md)",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
            }}
          >
            <strong>Filtered out.</strong> It failed {posting.filterFailures.length === 1 ? "a must-have" : "must-haves"}:
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {posting.filterFailures.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {posting.scoreFlags.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
          {posting.scoreFlags.map((f) => (
            <Badge key={f} tone="caution">
              {f}
            </Badge>
          ))}
        </div>
      )}

      <FitPanel
        postingId={posting.id}
        analysis={fit}
        bulletText={bulletText}
        aiEnabled={aiEnabled}
        autoRun={aiEnabled && passed && !posting.archivedAt && Boolean(parsedMaster?.success)}
      />

      <div className="form-card" style={{ marginBottom: 28, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <Eyebrow index="00">Why it scored {posting.score ?? "—"}</Eyebrow>
          <span style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
            Lane: {LANE_LABEL[posting.lane as Lane]}
            {posting.laneOverride ? " (set by you)" : ""}
          </span>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Rule</th>
                <th className="num">Points</th>
                <th>Because the posting says</th>
              </tr>
            </thead>
            <tbody>
              {categories.flatMap((cat) =>
                breakdown
                  .filter((b) => b.category === cat)
                  .map((b, i) => (
                    <tr key={`${cat}-${b.rule}`}>
                      <td style={{ fontSize: "var(--text-sm)" }}>{i === 0 ? CATEGORY_LABEL[cat] : ""}</td>
                      <td style={{ fontSize: "var(--text-sm)" }}>{b.label}</td>
                      <td className="num" style={{ color: b.points < 0 ? "var(--critical)" : "var(--positive)" }}>
                        {b.points > 0 ? `+${b.points}` : b.points}
                      </td>
                      <td style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>{b.evidence}</td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
        <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
          Starts at 30. Each category is capped, so stacking keywords can&apos;t run away with the score.
        </p>
      </div>

      <BenefitsPanel companyId={posting.companyId} postingId={posting.id} merged={merged} owner={ownerBenefits} />

      <JobPipelineCard
        postingId={posting.id}
        status={posting.status as JobStatus}
        appliedOnIso={posting.appliedAt ? dateToIso(posting.appliedAt) : null}
        nextActionNote={posting.nextActionNote}
        nextActionDueIso={posting.nextActionDue ? dateToIso(posting.nextActionDue) : null}
        notes={posting.notes}
        tailoringNotes={posting.tailoringNotes}
        lane={posting.lane as Lane}
        laneOverride={posting.laneOverride as Lane | null}
        archived={posting.archivedAt !== null}
        deletable={canDeletePosting(posting)}
      />

      {posting.company.awards.length > 0 && (
        <div className="form-card" style={{ marginBottom: 28, display: "grid", gap: 10 }}>
          <Eyebrow index="$">Federal awards: {posting.company.name}</Eyebrow>
          <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
            From USAspending. Useful for &quot;awarded or contingent?&quot; and &quot;how many option years?&quot; on the call.
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: "var(--text-sm)", display: "grid", gap: 6 }}>
            {posting.company.awards.map((a) => (
              <li key={a.id}>
                <a href={a.url} target="_blank" rel="noreferrer">
                  {formatAwardAmount(a.amountCents)}
                </a>{" "}
                {a.subAgency ?? a.agency}
                {a.description ? ` · ${a.description.toLowerCase()}` : ""}
                <span style={{ color: "var(--text-muted)" }}>
                  {" "}
                  · {a.piid} · {a.startDate ? dateToIso(a.startDate) : "?"} to {a.endDate ? dateToIso(a.endDate) : "?"}
                  {isCurrentAward(a, new Date()) ? "" : " · ended"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <CompanyCallChecklist
        companyId={posting.companyId}
        companyName={posting.company.name}
        postingId={posting.id}
        answers={(posting.company.questions ?? {}) as Record<string, string>}
      />

      <JobActivityPanel
        postingId={posting.id}
        items={posting.activity.map((a) => ({
          id: a.id,
          kind: a.kind,
          occurredOnIso: dateToIso(a.occurredAt),
          note: a.note,
          fromStatus: a.fromStatus as JobStatus | null,
          toStatus: a.toStatus as JobStatus | null,
        }))}
      />

      <div className="form-card" style={{ marginBottom: 28, display: "grid", gap: 10 }}>
        <Eyebrow index="05">Where it&apos;s posted</Eyebrow>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: "var(--text-sm)" }}>
          <li>
            <a href={posting.url} target="_blank" rel="noreferrer">
              {postingSiteLabel(posting)}
            </a>{" "}
            ({posting.source === "MANUAL" ? "added" : "first seen"} {dateToIso(posting.firstSeenAt)})
          </li>
          {posting.aliases.map((a) => (
            <li key={a.id}>
              <a href={a.url} target="_blank" rel="noreferrer">
                {postingSiteLabel(a)}
              </a>{" "}
              (duplicate merged {dateToIso(a.firstSeenAt)})
            </li>
          ))}
        </ul>
      </div>

      <details className="form-card" style={{ marginBottom: 28 }}>
        <summary style={{ cursor: "pointer", fontFamily: "var(--font-sans)" }}>Full posting text</summary>
        <div style={{ whiteSpace: "pre-wrap", fontSize: "var(--text-sm)", lineHeight: 1.6, marginTop: 12 }}>{posting.descriptionText}</div>
      </details>
    </>
  );
}
