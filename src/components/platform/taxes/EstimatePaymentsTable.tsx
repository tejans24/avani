"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useController, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { estimatePaymentSchema, type EstimatePaymentInput } from "@/lib/validations";
import { deleteEstimatePayment, recordEstimatePayment } from "@/actions/tax";
import type { EstimatePaymentView } from "@/lib/tax-data";
import { formatCents } from "@/lib/money";
import { formatDateLong } from "@/lib/dates";
import { FormDateInput, FormMoneyInput, FormSelect, FormTextInput } from "@/components/form";
import { Field, Select } from "@/components/form/shared";
import { Button } from "@/components/platform/ds";

const JURISDICTION_OPTIONS = [
  { value: "FEDERAL", label: "Federal" },
  { value: "STATE", label: "State" },
];

/** Recorded estimate payments for the year + inline record-payment form. */
export function EstimatePaymentsTable({
  payments,
  year,
  todayIso,
}: {
  payments: EstimatePaymentView[];
  year: number;
  todayIso: string;
}) {
  const router = useRouter();
  const emptyPayment: EstimatePaymentInput = {
    year,
    quarter: undefined as unknown as number,
    jurisdiction: "FEDERAL",
    paidDate: todayIso,
    amountCents: undefined as unknown as number,
    notes: "",
  };
  const { control, handleSubmit, reset } = useForm<EstimatePaymentInput>({
    resolver: zodResolver(estimatePaymentSchema) as Resolver<EstimatePaymentInput>,
    defaultValues: emptyPayment,
  });
  // Quarter is a number in the schema; the native select yields strings, so
  // wire it manually with a "" <-> undefined / "2" <-> 2 mapping.
  const { field: quarterField, fieldState: quarterState } = useController({
    control,
    name: "quarter",
  });

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (data: EstimatePaymentInput) => {
    setError(null);
    startTransition(async () => {
      const result = await recordEstimatePayment(data);
      if (result.ok === false) {
        setError(result.error);
        return;
      }
      reset(emptyPayment);
      router.refresh();
    });
  };

  const onDelete = (id: string) => {
    setError(null);
    startTransition(async () => {
      const result = await deleteEstimatePayment(id);
      if (result.ok === false) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="form-card" style={{ marginBottom: 24 }}>
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-lg)",
          margin: "0 0 16px",
          color: "var(--text-primary)",
        }}
      >
        Payments recorded for {year}
      </h2>

      {payments.length === 0 ? (
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-sm)",
            color: "var(--text-muted)",
            margin: "0 0 16px",
          }}
        >
          No estimated payments recorded yet this year.
        </p>
      ) : (
        <table className="data-table" data-testid="payments-table" style={{ marginBottom: 16 }}>
          <thead>
            <tr>
              <th>Quarter</th>
              <th>Jurisdiction</th>
              <th>Paid</th>
              <th className="num">Amount</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>Q{p.quarter}</td>
                <td>{p.jurisdiction === "FEDERAL" ? "Federal" : "State"}</td>
                <td>{formatDateLong(p.paidDateIso)}</td>
                <td className="num">{formatCents(p.amountCents)}</td>
                <td>{p.notes ?? "—"}</td>
                <td style={{ textAlign: "right" }}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => onDelete(p.id)}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="form-grid">
          <Field
            label="Quarter"
            htmlFor="quarter"
            required
            error={quarterState.error?.message}
          >
            <Select
              id="quarter"
              name={quarterField.name}
              invalid={!!quarterState.error}
              value={quarterField.value == null ? "" : String(quarterField.value)}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                quarterField.onChange(
                  e.target.value === "" ? undefined : Number(e.target.value)
                )
              }
            >
              <option value="" disabled>
                Select…
              </option>
              {[1, 2, 3, 4].map((q) => (
                <option key={q} value={String(q)}>
                  Q{q}
                </option>
              ))}
            </Select>
          </Field>
          <FormSelect
            control={control}
            name="jurisdiction"
            label="Jurisdiction"
            required
            options={JURISDICTION_OPTIONS}
          />
          <FormDateInput control={control} name="paidDate" label="Paid date" required />
          <FormMoneyInput control={control} name="amountCents" label="Amount" required />
          <FormTextInput
            control={control}
            name="notes"
            label="Notes"
            placeholder="Confirmation number, EFTPS…"
            className="span-2"
          />
        </div>

        {error && (
          <div style={{ marginTop: 16 }} role="alert">
            <p
              style={{
                margin: 0,
                fontFamily: "var(--font-sans)",
                fontSize: "var(--text-sm)",
                color: "var(--critical)",
              }}
            >
              {error}
            </p>
          </div>
        )}

        <div className="form-actions">
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Saving…" : "Record payment"}
          </Button>
        </div>
      </form>
    </div>
  );
}
