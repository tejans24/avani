import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPnlPageData } from "@/lib/pnl-data";
import { todayUtc } from "@/lib/dates";
import { renderPnlPdfBuffer } from "@/pdf/PnlPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAuth();
  } catch {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year")) || todayUtc().getUTCFullYear();
  // Quarterly columns keep the landscape page readable.
  const { pnl, reconciliation } = await getPnlPageData({
    year,
    granularity: "QUARTER",
  });
  const settings = await db.companySettings.findUniqueOrThrow({ where: { id: 1 } });

  const buffer = await renderPnlPdfBuffer({
    data: pnl,
    year,
    companyName: settings.companyName,
    reconciliation,
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="pnl-${year}.pdf"`,
    },
  });
}
