"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { invoiceSchema, type InvoiceInput } from "@/lib/validations";
import { computeInvoiceTotals, formatBps, formatCents } from "@/lib/money";
import { addNetDaysUtc, dateToIso, isoToUtcDate, todayUtc } from "@/lib/dates";
import { createInvoice, updateInvoice } from "@/actions/invoices";
import { FormSelect, FormDateInput, FormNumberInput, FormTextarea } from "@/components/form";
import { Button } from "@/components/platform/ds";
import { LineItemsEditor } from "./LineItemsEditor";

type NetDaysMode = "BUSINESS" | "CALENDAR";

export interface InvoiceFormClient {
  id: string;
  name: string;
  /** Payment-term override; null = use company default. */
  netDays?: number | null;
  netDaysMode?: NetDaysMode | null;
}

export interface InvoiceFormProps {
  clients: InvoiceFormClient[];
  defaults: {
    taxRateBps: number;
    netBusinessDays: number;
    netDaysMode: NetDaysMode;
    terms: string;
  };
  /** Pre-selected client (e.g. from a client page's "New invoice" button). */
  initialClientId?: string;
  /** Present = edit mode. */
  invoice?: InvoiceInput & { id: string };
}

const totalsRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 24,
  padding: "6px 0",
};

const totalsValueStyle: React.CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  color: "var(--text-primary)",
};

/** Live totals: recompute from the currently-valid rows as the user types. */
function TotalsFooter({ control }: { control: Control<InvoiceInput> }) {
  const lineItems = useWatch({ control, name: "lineItems" });
  const taxRateBps = useWatch({ control, name: "taxRateBps" });

  const validRows = (lineItems ?? [])
    .map((row) => ({
      quantity: Number(row?.quantity),
      unitPriceCents: Number(row?.unitPriceCents),
    }))
    .filter(
      (row) =>
        Number.isFinite(row.quantity) &&
        row.quantity > 0 &&
        Number.isFinite(row.unitPriceCents) &&
        row.unitPriceCents >= 0
    );

  const bpsNumber = Number(taxRateBps);
  const bps =
    Number.isFinite(bpsNumber) && bpsNumber >= 0 ? Math.min(Math.trunc(bpsNumber), 10000) : 0;
  const totals = computeInvoiceTotals(validRows, bps);

  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
      <div
        style={{
          minWidth: 280,
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-sm)",
          color: "var(--text-muted)",
        }}
      >
        <div style={totalsRowStyle}>
          <span>Subtotal</span>
          <span data-testid="totals-subtotal" style={totalsValueStyle}>
            {formatCents(totals.subtotalCents)}
          </span>
        </div>
        <div style={totalsRowStyle}>
          <span>Sales tax ({formatBps(bps)})</span>
          <span data-testid="totals-tax" style={totalsValueStyle}>
            {formatCents(totals.taxCents)}
          </span>
        </div>
        <div
          style={{
            ...totalsRowStyle,
            borderTop: "1px solid var(--border-subtle)",
            marginTop: 4,
            paddingTop: 10,
            fontSize: "var(--text-lg)",
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          <span>Total</span>
          <span data-testid="totals-total" style={totalsValueStyle}>
            {formatCents(totals.totalCents)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function InvoiceForm({ clients, defaults, initialClientId, invoice }: InvoiceFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Effective payment terms for a client (its override, else company default).
  const termsFor = (clientId: string) => {
    const c = clients.find((x) => x.id === clientId);
    return {
      days: c?.netDays ?? defaults.netBusinessDays,
      mode: (c?.netDaysMode ?? defaults.netDaysMode) as NetDaysMode,
    };
  };
  const dueDateFor = (clientId: string, issueIso: string) => {
    const { days, mode } = termsFor(clientId);
    return dateToIso(addNetDaysUtc(isoToUtcDate(issueIso), days, mode));
  };

  const initialIssue = dateToIso(todayUtc());
  const defaultValues: InvoiceInput = invoice
    ? {
        clientId: invoice.clientId,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        taxRateBps: invoice.taxRateBps,
        memo: invoice.memo ?? "",
        lineItems: invoice.lineItems,
      }
    : {
        clientId: initialClientId ?? "",
        issueDate: initialIssue,
        dueDate: dueDateFor(initialClientId ?? "", initialIssue),
        taxRateBps: defaults.taxRateBps,
        memo: defaults.terms,
        lineItems: [
          {
            description: "",
            quantity: undefined as unknown as number,
            unitPriceCents: undefined as unknown as number,
          },
        ],
      };

  const { control, handleSubmit, setValue } = useForm<InvoiceInput>({
    resolver: zodResolver(invoiceSchema),
    defaultValues,
  });

  // In create mode, keep the due date in step with the selected client's terms
  // and the issue date. Edit mode preserves the invoice's saved due date.
  const watchedClientId = useWatch({ control, name: "clientId" });
  const watchedIssueDate = useWatch({ control, name: "issueDate" });
  useEffect(() => {
    if (invoice) return;
    if (!watchedClientId || !watchedIssueDate) return;
    setValue("dueDate", dueDateFor(watchedClientId, watchedIssueDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedClientId, watchedIssueDate]);

  const taxRateBps = useWatch({ control, name: "taxRateBps" });
  const taxHint = `${
    typeof taxRateBps === "number" && Number.isFinite(taxRateBps) ? formatBps(taxRateBps) : "0%"
  } — 100 bps = 1%.`;

  const cancelHref = invoice ? `/invoices/${invoice.id}` : "/invoices";

  const onSubmit = (data: InvoiceInput) => {
    setError(null);
    startTransition(async () => {
      const result = invoice ? await updateInvoice(invoice.id, data) : await createInvoice(data);
      // Equality (not truthiness) check: with strict:false, only discriminant
      // equality narrows the ActionResult union.
      if (result.ok === false) {
        setError(result.error);
        return;
      }
      router.push(result.id ? `/invoices/${result.id}` : "/invoices");
    });
  };

  return (
    <form className="form-card" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="form-grid">
        <FormSelect
          control={control}
          name="clientId"
          label="Client"
          required
          placeholder="Select a client…"
          options={clients.map((c) => ({ value: c.id, label: c.name }))}
          className="span-2"
        />
        <FormDateInput control={control} name="issueDate" label="Issue date" required />
        <FormDateInput control={control} name="dueDate" label="Due date" required />
        <FormNumberInput
          control={control}
          name="taxRateBps"
          label="Tax rate (basis points)"
          required
          min={0}
          max={10000}
          step={1}
          hint={taxHint}
        />
        <FormTextarea
          control={control}
          name="memo"
          label="Memo"
          rows={4}
          hint="Shown on the invoice as Terms"
          className="span-2"
        />
      </div>

      <LineItemsEditor control={control} />

      <TotalsFooter control={control} />

      {error && (
        <p
          role="alert"
          style={{
            margin: "16px 0 0",
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-sm)",
            color: "var(--critical)",
          }}
        >
          {error}
        </p>
      )}

      <div className="form-actions">
        <Button href={cancelHref} variant="ghost" disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : invoice ? "Save changes" : "Create invoice"}
        </Button>
      </div>
    </form>
  );
}
