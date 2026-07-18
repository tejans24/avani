"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/platform/ds";
import {
  deleteDraftInvoice,
  duplicateInvoice,
  markInvoicePaid,
  voidInvoice,
} from "@/actions/invoices";
import { sendInvoice } from "@/actions/send-invoice";

type Props = {
  invoiceId: string;
  status: "DRAFT" | "SENT" | "PAID" | "VOID";
  number: string;
  billingEmail: string;
  ccEmails: string[];
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(33, 31, 26, 0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 50,
};

const dialogStyle: React.CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-lg)",
  padding: 28,
  width: "min(440px, 92vw)",
  fontFamily: "var(--font-sans)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--text-xs)",
  fontWeight: 500,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-sm)",
  color: "var(--ink)",
  background: "var(--warm-white)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-md)",
  marginBottom: 14,
};

function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="alert"
      style={{
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-sm)",
        color: "var(--critical)",
        margin: "10px 0 0",
      }}
    >
      {message}
    </p>
  );
}

export function InvoiceActions({
  invoiceId,
  status,
  number,
  billingEmail,
  ccEmails,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"send" | "paid" | null>(null);
  const [to, setTo] = useState(billingEmail);
  const [cc, setCc] = useState(ccEmails.join(", "));
  const [paidDate, setPaidDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );

  function run(action: () => Promise<{ ok: boolean; error?: string } | { ok: true; id?: string }>, after?: (r: { ok: boolean; id?: string; error?: string }) => void) {
    setError(null);
    startTransition(async () => {
      const result = (await action()) as { ok: boolean; id?: string; error?: string };
      if (!result.ok) {
        setError(result.error ?? "Something went wrong");
        return;
      }
      setDialog(null);
      after?.(result);
      router.refresh();
    });
  }

  const canSend = status === "DRAFT" || status === "SENT";

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
      {status === "DRAFT" && (
        <Button href={`/invoices/${invoiceId}/edit`} variant="secondary" size="sm">
          Edit
        </Button>
      )}
      {canSend && (
        <Button
          variant="accent"
          size="sm"
          disabled={pending}
          onClick={() => setDialog("send")}
        >
          {status === "SENT" ? "Resend" : "Send"}
        </Button>
      )}
      {status === "SENT" && (
        <Button
          variant="primary"
          size="sm"
          disabled={pending}
          onClick={() => setDialog("paid")}
        >
          Mark as paid
        </Button>
      )}
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          run(() => duplicateInvoice(invoiceId), (r) => {
            if (r.id) router.push(`/invoices/${r.id}`);
          })
        }
      >
        Duplicate
      </Button>
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        title="Copy with all dates shifted forward 14 days"
        onClick={() =>
          run(() => duplicateInvoice(invoiceId, { shiftDays: 14 }), (r) => {
            if (r.id) router.push(`/invoices/${r.id}`);
          })
        }
      >
        Duplicate next period
      </Button>
      <Button
        href={`/api/invoices/${invoiceId}/pdf?download=1`}
        variant="ghost"
        size="sm"
      >
        Download PDF
      </Button>
      {status === "DRAFT" && (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          style={{ color: "var(--critical)" }}
          onClick={() => {
            if (confirm(`Delete draft ${number}? This cannot be undone.`)) {
              run(() => deleteDraftInvoice(invoiceId), () => router.push("/invoices"));
            }
          }}
        >
          Delete draft
        </Button>
      )}
      {(status === "DRAFT" || status === "SENT") && (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          style={{ color: "var(--caution)" }}
          onClick={() => {
            if (confirm(`Void invoice ${number}?`)) {
              run(() => voidInvoice(invoiceId));
            }
          }}
        >
          Void
        </Button>
      )}

      {error && !dialog && <ErrorNote message={error} />}

      {dialog === "send" && (
        <div style={overlayStyle} onClick={() => !pending && setDialog(null)}>
          <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 18px", fontFamily: "var(--font-display)", fontSize: "var(--text-xl)", color: "var(--ink)" }}>
              Send {number}
            </h3>
            <label style={labelStyle} htmlFor="send-to">To</label>
            <input
              id="send-to"
              style={inputStyle}
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            <label style={labelStyle} htmlFor="send-cc">CC (comma-separated)</label>
            <input
              id="send-cc"
              style={inputStyle}
              type="text"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
            />
            <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", margin: "0 0 16px" }}>
              The invoice PDF is attached automatically.
            </p>
            {error && <ErrorNote message={error} />}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button
                variant="accent"
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    sendInvoice(invoiceId, {
                      to,
                      cc: cc.split(",").map((s) => s.trim()).filter(Boolean),
                    })
                  )
                }
              >
                {pending ? "Sending…" : "Send invoice"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {dialog === "paid" && (
        <div style={overlayStyle} onClick={() => !pending && setDialog(null)}>
          <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 18px", fontFamily: "var(--font-display)", fontSize: "var(--text-xl)", color: "var(--ink)" }}>
              Mark {number} as paid
            </h3>
            <label style={labelStyle} htmlFor="paid-date">Payment date</label>
            <input
              id="paid-date"
              style={inputStyle}
              type="date"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
            />
            {error && <ErrorNote message={error} />}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={pending}
                onClick={() => run(() => markInvoicePaid(invoiceId, paidDate))}
              >
                {pending ? "Saving…" : "Mark paid"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
