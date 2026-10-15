import Link from "next/link";
import { db } from "@/lib/db";
import { Eyebrow } from "@/components/platform/ds";
import { ResumeImport } from "@/components/platform/jobs/ResumeImport";
import { resumeSchema } from "@/lib/jobs/resume-schema";

export const metadata = { title: "Master résumé — Avani" };
export const dynamic = "force-dynamic";

export default async function ResumePage() {
  const versions = await db.resumeMaster.findMany({ orderBy: { version: "desc" }, take: 10 });
  const current = versions[0] ? resumeSchema.safeParse(versions[0].data) : null;
  const m = current?.success ? current.data : null;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub" style={{ marginBottom: 6 }}>
            <Link href="/jobs">Jobs</Link> / Résumé
          </p>
          <h1>Master résumé</h1>
          <p className="sub">
            The source of truth for tailoring. Read-only here: edit master.json and import it as a new version. Contact details never go to the AI.
          </p>
        </div>
      </div>

      {m ? (
        <div className="form-card" style={{ marginBottom: 28, display: "grid", gap: 10, fontSize: "var(--text-sm)" }}>
          <Eyebrow index={`v${versions[0].version}`}>Current version</Eyebrow>
          <div>
            <strong>{m.headline}</strong>
            {m.headlineOptions.length > 0 && <span style={{ color: "var(--text-muted)" }}> · alternates: {m.headlineOptions.join(", ")}</span>}
          </div>
          <div style={{ color: "var(--text-secondary)" }}>{m.summary}</div>
          <div style={{ color: "var(--text-muted)" }}>
            {m.experience.length} roles · {m.experience.reduce((n, e) => n + e.bullets.length, 0)} bullets (
            {m.experience.reduce((n, e) => n + e.bullets.filter((b) => b.reserve).length, 0)} reserve) · {m.stories.length} stories · {m.skills.length} skill
            groups
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {m.experience.map((e) => (
              <li key={e.id}>
                {e.title}, {e.organization} <span style={{ color: "var(--text-muted)" }}>({e.bullets.length})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="empty-state" style={{ marginBottom: 28 }}>
          <p className="empty-title">No master résumé yet</p>
          <p>Import master.json to start tailoring.</p>
        </div>
      )}

      <Eyebrow index="+">Import a new version</Eyebrow>
      <div style={{ marginTop: 12 }}>
        <ResumeImport />
      </div>
    </>
  );
}
