"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useController, useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { taxSettingsSchema, type TaxSettingsInput } from "@/lib/validations";
import { updateTaxSettings } from "@/actions/tax";
import { formatBps } from "@/lib/money";
import { FormMoneyInput, FormNumberInput, FormTextInput } from "@/components/form";
import { Field, Select } from "@/components/form/shared";
import { Button, Callout, Eyebrow, Divider } from "@/components/platform/ds";

const sectionHeadStyle: React.CSSProperties = { marginBottom: 16 };
const dividerStyle: React.CSSProperties = { margin: "28px 0" };

function bpsHint(value: unknown): string {
  return `${typeof value === "number" && Number.isFinite(value) ? formatBps(value) : "0%"} — 100 bps = 1%. Effective rate, not brackets.`;
}

/** TaxSettings singleton form (mirrors SettingsForm). Rates are stored as bps. */
export function TaxSettingsForm({ settings }: { settings: TaxSettingsInput }) {
  const router = useRouter();
  const { control, handleSubmit } = useForm<TaxSettingsInput>({
    resolver: zodResolver(taxSettingsSchema) as Resolver<TaxSettingsInput>,
    // `values` (not defaultValues) so server refreshes after save propagate in.
    values: settings,
  });

  const federalBps = useWatch({ control, name: "federalRateBps" });
  const stateBps = useWatch({ control, name: "stateRateBps" });

  // cpaFiles1120S is boolean | null (Yes / No / Not sure) — wire the select
  // manually since the value isn't a string.
  const { field: cpaField } = useController({ control, name: "cpaFiles1120S" });
  const cpaValue =
    cpaField.value === true ? "yes" : cpaField.value === false ? "no" : "unsure";

  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const onSubmit = (data: TaxSettingsInput) => {
    setStatus(null);
    startTransition(async () => {
      const result = await updateTaxSettings(data);
      setStatus(
        result.ok
          ? { ok: true, message: "Tax settings saved." }
          : { ok: false, message: result.error ?? "Something went wrong saving tax settings." }
      );
      if (result.ok) router.refresh();
    });
  };

  return (
    <form className="form-card" style={{ marginBottom: 24 }} onSubmit={handleSubmit(onSubmit)} noValidate>
      <Eyebrow index="01" style={sectionHeadStyle}>
        Estimate inputs
      </Eyebrow>
      <div className="form-grid">
        <FormNumberInput
          control={control}
          name="federalRateBps"
          label="Federal effective rate (basis points)"
          required
          min={0}
          max={10000}
          step={1}
          hint={bpsHint(federalBps)}
        />
        <FormNumberInput
          control={control}
          name="stateRateBps"
          label="State effective rate (basis points)"
          required
          min={0}
          max={10000}
          step={1}
          hint={bpsHint(stateBps)}
        />
        <FormMoneyInput
          control={control}
          name="ownerSalaryAnnualCents"
          label="Owner annual salary"
          required
          hint="Your W-2 wages — withholding covers these; estimates cover the K-1 profit."
        />
        <FormMoneyInput
          control={control}
          name="withholdingYtdCents"
          label="Withholding YTD"
          required
          hint="Payroll withholding so far this year, subtracted from the estimate."
        />
        <FormTextInput
          control={control}
          name="state"
          label="State"
          placeholder="CA"
          hint="Where you file state income tax."
        />
      </div>

      <Divider style={dividerStyle} />

      <Eyebrow index="02" style={sectionHeadStyle}>
        Filing facts
      </Eyebrow>
      <div className="form-grid">
        <Field
          label="Does a CPA file your 1120-S?"
          htmlFor="cpaFiles1120S"
          hint="Shapes the compliance checklist and the accountant package."
        >
          <Select
            id="cpaFiles1120S"
            name={cpaField.name}
            value={cpaValue}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              cpaField.onChange(
                e.target.value === "yes" ? true : e.target.value === "no" ? false : null
              )
            }
          >
            <option value="unsure">Not sure</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </Select>
        </Field>
        <FormTextInput
          control={control}
          name="payrollProvider"
          label="Payroll provider"
          placeholder="Gusto"
          hint="e.g. Gusto — S-corp owners need W-2 payroll"
        />
      </div>

      {status && (
        <div style={{ marginTop: 20 }} role={status.ok ? "status" : "alert"}>
          {status.ok ? (
            <Callout tone="brand">{status.message}</Callout>
          ) : (
            <p
              style={{
                margin: 0,
                fontFamily: "var(--font-sans)",
                fontSize: "var(--text-sm)",
                color: "var(--critical)",
              }}
            >
              {status.message}
            </p>
          )}
        </div>
      )}

      <div className="form-actions">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Save tax settings"}
        </Button>
      </div>
    </form>
  );
}
