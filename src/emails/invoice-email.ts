import { formatCents } from "@/lib/money";
import { formatDateLong } from "@/lib/dates";

export type InvoiceEmailData = {
  invoiceNumber: string;
  companyName: string;
  clientName: string;
  totalCents: number;
  dueDate: Date | string;
  payViaLabel: string;
  paymentInstructions: string;
  /** Client-facing hosted invoice page (tokenized). */
  shareUrl?: string;
};

export function buildInvoiceEmailSubject(d: InvoiceEmailData): string {
  return `Invoice ${d.invoiceNumber} from ${d.companyName} — ${formatCents(d.totalCents)}`;
}

/** Brand palette inlined: bone #F4EFE5, warm white #FBF8F1, ink #211F1A, forest #28352B, clay #B0532F. */
export function buildInvoiceEmailHtml(d: InvoiceEmailData): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const instructions = esc(d.paymentInstructions).replace(/\n/g, "<br/>");

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#F4EFE5;font-family:Helvetica,Arial,sans-serif;color:#211F1A;">
    <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
      <div style="background:#FBF8F1;border:1px solid #E2D9C6;border-radius:10px;overflow:hidden;">
        <div style="background:#28352B;color:#EFEDE2;padding:20px 28px;font-size:15px;letter-spacing:0.02em;">
          ${esc(d.companyName)}
        </div>
        <div style="padding:28px;">
          <p style="margin:0 0 6px;font-size:13px;color:#6E6657;text-transform:uppercase;letter-spacing:0.06em;">
            Invoice ${esc(d.invoiceNumber)}
          </p>
          <p style="margin:0 0 20px;font-size:28px;font-weight:bold;color:#28352B;">
            ${formatCents(d.totalCents)}
          </p>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">
            Hi ${esc(d.clientName)},<br/>
            Please find invoice ${esc(d.invoiceNumber)} attached as a PDF.
            Payment is due by <strong>${formatDateLong(d.dueDate)}</strong> via ${esc(d.payViaLabel)}.
          </p>
          ${
            d.shareUrl
              ? `<p style="margin:0 0 20px;">
            <a href="${d.shareUrl}" style="display:inline-block;background:#28352B;color:#EFEDE2;text-decoration:none;font-size:14px;padding:11px 22px;border-radius:8px;">
              View invoice
            </a>
          </p>`
              : ""
          }
          <div style="background:#F4EFE5;border:1px solid #E2D9C6;border-radius:8px;padding:16px 20px;margin:0 0 16px;">
            <p style="margin:0 0 8px;font-size:12px;color:#6E6657;text-transform:uppercase;letter-spacing:0.06em;">
              Payment instructions
            </p>
            <p style="margin:0;font-size:13px;line-height:1.7;">${instructions}</p>
          </div>
          <p style="margin:0;font-size:13px;color:#494539;line-height:1.6;">
            Questions about this invoice? Just reply to this email.
          </p>
        </div>
      </div>
      <p style="text-align:center;font-size:11px;color:#6E6657;margin:16px 0 0;">
        Sent by ${esc(d.companyName)}
      </p>
    </div>
  </body>
</html>`;
}
