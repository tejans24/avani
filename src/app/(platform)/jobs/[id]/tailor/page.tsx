import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Button } from "@/components/platform/ds";
import { TailorEditor } from "@/components/platform/jobs/TailorEditor";
import { resumeSchema, type Resume } from "@/lib/jobs/resume-schema";
import type { TailoredDoc } from "@/lib/jobs/tailor";

export const metadata = { title: "Tailor résumé — Avani" };
export const dynamic = "force-dynamic";
// Tailoring with Claude runs inside this page's server action.
export const maxDuration = 300;

export default async function TailorPage({ params, searchParams }: { params: { id: string }; searchParams: { v?: string } }) {
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

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub" style={{ marginBottom: 6 }}>
            <Link href="/jobs">Jobs</Link> / <Link href={`/jobs/${posting.id}`}>{posting.title}</Link> / Tailor
          </p>
          <h1>Tailor résumé</h1>
          <p className="sub">
            {posting.title} at {posting.company.name}. Selects and rewords only what&apos;s in your master résumé; anything it can&apos;t trace back is flagged.
          </p>
        </div>
        {posting.tailored.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {posting.tailored.map((t) => (
              <Button key={t.id} href={`/jobs/${posting.id}/tailor?v=${t.id}`} variant={t.id === selectedId ? "primary" : "ghost"} size="sm">
                v{t.version}
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
          initial={(selected?.data as unknown as TailoredDoc) ?? null}
          appliedVersionId={posting.appliedResumeId}
          hasApiKey={Boolean(process.env.ANTHROPIC_API_KEY) || process.env.TAILOR_MODE === "fake"}
        />
      )}
    </>
  );
}
