import { invoiceByShareToken } from "@/lib/share-invoice";
import { renderInvoicePdfBuffer } from "@/pdf/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public PDF download for the client link — the token is the authorization. */
export async function GET(
  _req: Request,
  { params }: { params: { token: string } }
) {
  const invoice = await invoiceByShareToken(params.token);
  if (!invoice) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  }
  const { buffer } = await renderInvoicePdfBuffer(invoice.id);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.number}.pdf"`,
      "X-Robots-Tag": "noindex",
      // Tokenized financial document — never cache in shared proxies/CDNs.
      "Cache-Control": "no-store",
    },
  });
}
