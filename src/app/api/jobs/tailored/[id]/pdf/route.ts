import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ResumeExportBlockedError, renderTailoredPdf } from "@/pdf/resume-render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tailored résumé PDF: inline for the preview, ?download=1 to save, ?info=1 for its name and page count. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { buffer, filename, pages, maxPages } = await renderTailoredPdf(params.id);
    // ?info=1: what the preview shows beside the file (name, page count, limit).
    if (req.nextUrl.searchParams.get("info") === "1") return NextResponse.json({ filename, pages, maxPages });
    const disposition = req.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${filename}"`,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof ResumeExportBlockedError) return NextResponse.json({ error: err.message }, { status: 409 });
    if ((err as { code?: string }).code === "P2025") return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw err;
  }
}
