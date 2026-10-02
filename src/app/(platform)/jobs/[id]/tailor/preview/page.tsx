import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Badge, Button } from "@/components/platform/ds";
import { CopyText } from "@/components/platform/jobs/CopyText";
import { ResumeExportBlockedError, renderTailoredPdf } from "@/pdf/resume-render";

export const metadata = { title: "Résumé preview — Avani" };
export const dynamic = "force-dynamic";

/** Preview first, download second: the iframe shows exactly the file you'd save. */
export default async function PreviewPage({ params, searchParams }: { params: { id: string }; searchParams: { v?: string } }) {
  const t = searchParams.v
    ? await db.tailoredResume.findUnique({ where: { id: searchParams.v }, include: { posting: { select: { id: true, title: true } } } })
    : null;
  if (!t || t.posting.id !== params.id) notFound();

  let rendered: { filename: string; pages: number } | null = null;
  let blocked: string | null = null;
  try {
    const r = await renderTailoredPdf(t.id);
    rendered = { filename: r.filename, pages: r.pages };
  } catch (e) {
    if (e instanceof ResumeExportBlockedError) blocked = e.message;
    else throw e;
  }
  const back = `/jobs/${params.id}/tailor?v=${t.id}`;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub" style={{ marginBottom: 6 }}>
            <Link href="/jobs">Jobs</Link> / <Link href={`/jobs/${params.id}`}>{t.posting.title}</Link> / <Link href={back}>Tailor v{t.version}</Link> / Preview
          </p>
          <h1>Preview</h1>
          {rendered && (
            <p className="sub" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {rendered.filename}
              <Badge tone={rendered.pages <= 2 ? "positive" : "caution"}>
                {rendered.pages} page{rendered.pages === 1 ? "" : "s"}
              </Badge>
              {rendered.pages > 2 && <span>Over two pages: reject a few bullets in older roles, then save a new version.</span>}
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Button href={back} variant="secondary" size="md">
            Back to editor
          </Button>
          {rendered && (
            <Button href={`/api/jobs/tailored/${t.id}/pdf?download=1`} variant="primary" size="md">
              Download PDF
            </Button>
          )}
        </div>
      </div>

      {blocked ? (
        <div className="empty-state">
          <p className="empty-title">Can&apos;t export yet</p>
          <p>{blocked} Fix them in the editor and save a new version.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 20 }}>
          <iframe
            title="Résumé PDF preview"
            src={`/api/jobs/tailored/${t.id}/pdf`}
            style={{ width: "100%", height: "80vh", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", background: "#fff" }}
          />
          {t.coverNote && <CopyText label="Cover note" text={t.coverNote} />}
        </div>
      )}
    </>
  );
}
