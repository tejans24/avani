import Link from "next/link";
import { CaptureForm } from "@/components/platform/jobs/CaptureForm";
import { CaptureHelpers } from "@/components/platform/jobs/CaptureHelpers";

export const metadata = { title: "Add a job — Avani" };
export const dynamic = "force-dynamic";

export default function CapturePage({ searchParams }: { searchParams: { url?: string; title?: string; text?: string; via?: string } }) {
  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub" style={{ marginBottom: 6 }}>
            <Link href="/jobs">Jobs</Link> / Add a job
          </p>
          <h1>Add a job</h1>
          <p className="sub">For postings you find yourself. Duplicates open the job you already have.</p>
        </div>
      </div>
      <div style={{ display: "grid", gap: 20 }}>
        <CaptureForm initial={searchParams} aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY) || process.env.TAILOR_MODE === "fake"} />
        <CaptureHelpers />
      </div>
    </>
  );
}
