import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Button } from "@/components/platform/ds";
import { TailorEditor } from "@/components/platform/jobs/TailorEditor";
import { resumeSchema, type Resume } from "@/lib/jobs/resume-schema";
import type { ChatTurnView } from "@/components/platform/jobs/TailorChat";
import type { FitAnalysis } from "@/lib/jobs/fit";
import { postingSimilarity, type TailoredDoc } from "@/lib/jobs/tailor";
import { madeAgo } from "@/lib/jobs/display";

export const metadata = { title: "Résumé for this job — Avani" };
export const dynamic = "force-dynamic";
// Tailoring with Claude runs inside this page's server action.
export const maxDuration = 300;

export default async function TailorPage({ params, searchParams }: { params: { id: string }; searchParams: { v?: string; auto?: string } }) {
  const posting = await db.jobPosting.findUnique({
    where: { id: params.id },
    include: {
      company: { select: { name: true } },
      tailored: { orderBy: { version: "desc" }, select: { id: true, version: true, createdAt: true } },
    },
  });
  if (!posting) notFound();

  const selectedId = searchParams.v ?? posting.tailored[0]?.id ?? null;
  const selected = selectedId ? await db.tailoredResume.findUnique({ where: { id: selectedId }, include: { master: true } }) : null;
  const masterRow = selected?.master ?? (await db.resumeMaster.findFirst({ orderBy: { version: "desc" } }));

  // Versions made for other jobs: the latest per job, most similar posting first.
  const others = await db.tailoredResume.findMany({
    where: { postingId: { not: posting.id } },
    orderBy: { version: "desc" },
    select: { id: true, version: true, postingId: true, posting: { select: { title: true, descriptionText: true, appliedResumeId: true, company: { select: { name: true } } } } },
  });
  const seen = new Set<string>();
  const reusable = others
    .filter((t) => (seen.has(t.postingId) ? false : (seen.add(t.postingId), true)))
    .map((t) => ({
      id: t.id,
      label: `${t.posting.company.name}: ${t.posting.title} v${t.version}`,
      similarity: postingSimilarity(posting.descriptionText, t.posting.descriptionText),
      sent: t.posting.appliedResumeId === t.id,
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 25);
  const fit = posting.fitAnalysis as unknown as FitAnalysis | null;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub" style={{ marginBottom: 6 }}>
            <Link href="/jobs">Jobs</Link> / <Link href={`/jobs/${posting.id}`}>{posting.title}</Link> / Résumé
          </p>
          <h1>Your résumé for this job</h1>
          <p className="sub">
            {posting.title} at {posting.company.name}. Built only from your master résumé; anything that can&apos;t be traced back is flagged.{" "}
            <Link href={`/jobs/${posting.id}`}>Back to the job&apos;s steps</Link>
          </p>
        </div>
        {posting.tailored.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {posting.tailored.map((t) => (
              <Button key={t.id} href={`/jobs/${posting.id}/tailor?v=${t.id}`} variant={t.id === selectedId ? "primary" : "ghost"} size="sm">
                v{t.version} · {madeAgo(t.createdAt)}
                {t.id === posting.appliedResumeId ? " (sent)" : ""}
              </Button>
            ))}
          </div>
        )}
      </div>

      {!masterRow ? (
        <div className="empty-state">
          <p className="empty-title">Import your master résumé first</p>
          <div className="empty-actions">
            <Button href="/jobs/resume" variant="primary" size="sm">
              Go to résumé
            </Button>
          </div>
        </div>
      ) : (
        <TailorEditor
          key={selectedId ?? "none"}
          postingId={posting.id}
          master={resumeSchema.parse(masterRow.data) as Resume}
          versionId={selected?.id ?? null}
          version={selected?.version ?? null}
          createdAtIso={selected?.createdAt.toISOString() ?? null}
          initial={(selected?.data as unknown as TailoredDoc) ?? null}
          appliedVersionId={posting.appliedResumeId}
          hasApiKey={Boolean(process.env.ANTHROPIC_API_KEY) || process.env.TAILOR_MODE === "fake"}
          posting={{ title: `${posting.title} at ${posting.company.name}`, descriptionText: posting.descriptionText }}
          requirements={fit?.fitTable ?? []}
          reusable={reusable}
          chat={(posting.tailorChat ?? []) as unknown as ChatTurnView[]}
          autoStart={searchParams.auto === "1" && posting.tailored.length === 0}
          coverLetter={fit?.coverLetter ?? null}
        />
      )}
    </>
  );
}
