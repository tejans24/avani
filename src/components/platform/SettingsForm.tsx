"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { settingsSchema, type SettingsInput } from "@/lib/validations";
import { formatBps } from "@/lib/money";
import { updateSettings } from "@/actions/settings";
import { FormTextInput, FormTextarea, FormNumberInput, FormSelect } from "@/components/form";
import { Button as DsButton } from "@/ds/components/core/Button";
import { Callout as DsCallout } from "@/ds/components/core/Callout";
import { Eyebrow as DsEyebrow } from "@/ds/components/core/Eyebrow";
import { Divider as DsDivider } from "@/ds/components/core/Divider";

// The ds components are untyped JSX; loosen them so tsc doesn't demand every prop.
const Button: React.ComponentType<any> = DsButton;
const Callout: React.ComponentType<any> = DsCallout;
const Eyebrow: React.ComponentType<any> = DsEyebrow;
const Divider: React.ComponentType<any> = DsDivider;

const sectionHeadStyle: React.CSSProperties = { marginBottom: 16 };
const dividerStyle: React.CSSProperties = { margin: "28px 0" };

export function SettingsForm({ settings }: { settings: SettingsInput }) {
  const { control, handleSubmit } = useForm<SettingsInput>({
    // defaultNetDaysMode has a zod .default(), which widens the schema input
    // type; pin the resolver to the output shape (as with clientSchema).
    resolver: zodResolver(settingsSchema) as Resolver<SettingsInput>,
    // `values` (not defaultValues) so server refreshes after save propagate in.
    values: settings,
  });

  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const taxRateBps = useWatch({ control, name: "defaultTaxRateBps" });

  const onSubmit = (data: SettingsInput) => {
    setStatus(null);
    startTransition(async () => {
      const result = await updateSettings(data);
      setStatus(
        result.ok
          ? { ok: true, message: "Settings saved." }
          : { ok: false, message: result.error ?? "Something went wrong saving settings." }
      );
    });
  };

  return (
    <form className="form-card" onSubmit={handleSubmit(onSubmit)} noValidate>
      <Eyebrow index="01" style={sectionHeadStyle}>
        Company
      </Eyebrow>
      <div className="form-grid">
        <FormTextInput
          control={control}
          name="companyName"
          label="Company name"
          required
          className="span-2"
        />
        <FormTextInput control={control} name="email" label="Email" type="email" required />
        <FormTextInput control={control} name="phone" label="Phone" type="tel" />
        <FormTextInput
          control={control}
          name="addressLine1"
          label="Address line 1"
          required
          className="span-2"
        />
        <FormTextInput
          control={control}
          name="addressLine2"
          label="Address line 2"
          className="span-2"
        />
        <FormTextInput control={control} name="city" label="City" required />
        <FormTextInput control={control} name="state" label="State" required />
        <FormTextInput control={control} name="postalCode" label="Postal code" required />
        <FormTextInput control={control} name="country" label="Country" required />
      </div>

      <Divider style={dividerStyle} />

      <Eyebrow index="02" style={sectionHeadStyle}>
        Invoicing defaults
      </Eyebrow>
      <div className="form-grid">
        <FormTextInput
          control={control}
          name="payViaLabel"
          label="Pay-via label"
          required
          hint='Shown on invoices next to payment details, e.g. "Manual transfer (ACH/Wire)".'
          className="span-2"
        />
        <FormNumberInput
          control={control}
          name="defaultNetBusinessDays"
          label="Default payment terms — due in (days)"
          required
          min={0}
          max={365}
          step={1}
          hint="New invoices default to issue date + this many days. Clients can override."
        />
        <FormSelect
          control={control}
          name="defaultNetDaysMode"
          label="Counted as"
          options={[
            { value: "BUSINESS", label: "Business days" },
            { value: "CALENDAR", label: "Calendar days" },
          ]}
        />
        <FormNumberInput
          control={control}
          name="defaultTaxRateBps"
          label="Default tax rate (basis points)"
          required
          min={0}
          max={10000}
          step={1}
          hint={`${typeof taxRateBps === "number" && Number.isFinite(taxRateBps) ? formatBps(taxRateBps) : "0%"} — 100 bps = 1%.`}
        />
        <FormTextarea
          control={control}
          name="defaultTerms"
          label="Default terms"
          rows={4}
          placeholder="Terms pre-filled onto new invoices"
          className="span-2"
        />
      </div>

      <Divider style={dividerStyle} />

      <Eyebrow index="03" style={sectionHeadStyle}>
        Payment instructions
      </Eyebrow>
      <div className="form-grid">
        <FormTextarea
          control={control}
          name="paymentInstructions"
          label="Payment instructions"
          required
          rows={6}
          placeholder="Bank name, account and routing numbers, wire details…"
          hint="Printed on every invoice so clients know how to pay."
          className="span-2"
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
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
