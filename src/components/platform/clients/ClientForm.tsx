"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useController, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { clientSchema, type ClientInput } from "@/lib/validations";
import { upsertClient } from "@/actions/clients";
import { FormTextInput, FormTextarea, FormEmailListInput } from "@/components/form";
import { Field, Select } from "@/components/form/shared";
import { Button, Eyebrow, Divider, Switch } from "@/components/platform/ds";

const sectionHeadStyle: React.CSSProperties = { marginBottom: 16 };
const dividerStyle: React.CSSProperties = { margin: "28px 0" };

const EMPTY_CLIENT: ClientInput = {
  name: "",
  contactName: "",
  billingEmail: "",
  ccEmails: [],
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
  notes: "",
  billingCadenceDays: null,
  overdueRemindersEnabled: true,
  invoicePrefix: "",
};

const CADENCE_OPTIONS = [
  { value: "", label: "Off — invoice manually" },
  { value: "7", label: "Every 7 days (weekly)" },
  { value: "14", label: "Every 14 days (biweekly)" },
  { value: "30", label: "Every 30 days (monthly)" },
];

export function ClientForm({
  client,
  clientId,
}: {
  client: ClientInput | null;
  clientId?: string;
}) {
  const router = useRouter();
  const { control, handleSubmit } = useForm<ClientInput>({
    // ccEmails has a zod .default(), which widens the schema's *input* type
    // (ccEmails optional). The form always holds the parsed shape, so pin the
    // resolver to the output type.
    resolver: zodResolver(clientSchema) as Resolver<ClientInput>,
    // `values` (not defaultValues) so server refreshes after save propagate in.
    ...(client ? { values: client } : { defaultValues: EMPTY_CLIENT }),
  });

  // Custom-wired fields: the cadence select maps "" <-> null (FormSelect's
  // placeholder option is disabled, so "Off" needs a real option), and the
  // reminders switch holds a boolean the ds Switch toggles directly.
  const { field: cadenceField } = useController({ control, name: "billingCadenceDays" });
  const { field: remindersField } = useController({ control, name: "overdueRemindersEnabled" });

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (data: ClientInput) => {
    setError(null);
    startTransition(async () => {
      const result = await upsertClient(clientId ?? null, data);
      // `=== false` (not `else`) so the union narrows under strict:false.
      if (result.ok === false) {
        setError(result.error);
        return;
      }
      router.push("/clients");
      router.refresh();
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
          name="name"
          label="Name"
          required
          className="span-2"
        />
        <FormTextInput
          control={control}
          name="contactName"
          label="Contact name"
          className="span-2"
        />
      </div>

      <Divider style={dividerStyle} />

      <Eyebrow index="02" style={sectionHeadStyle}>
        Billing
      </Eyebrow>
      <div className="form-grid">
        <FormTextInput
          control={control}
          name="billingEmail"
          label="Billing email"
          type="email"
          required
          className="span-2"
        />
        <FormEmailListInput
          control={control}
          name="ccEmails"
          label="CC emails"
          hint="Comma-separated; CC'd on every invoice"
          className="span-2"
        />
      </div>

      <Divider style={dividerStyle} />

      <Eyebrow index="03" style={sectionHeadStyle}>
        Address
      </Eyebrow>
      <div className="form-grid">
        <FormTextInput
          control={control}
          name="addressLine1"
          label="Address line 1"
          className="span-2"
        />
        <FormTextInput
          control={control}
          name="addressLine2"
          label="Address line 2"
          className="span-2"
        />
        <FormTextInput control={control} name="city" label="City" />
        <FormTextInput control={control} name="state" label="State" />
        <FormTextInput control={control} name="postalCode" label="Postal code" />
        <FormTextInput control={control} name="country" label="Country" />
      </div>

      <Divider style={dividerStyle} />

      <Eyebrow index="04" style={sectionHeadStyle}>
        Billing automation
      </Eyebrow>
      <div className="form-grid">
        <FormTextInput
          control={control}
          name="invoicePrefix"
          label="Invoice prefix"
          placeholder="ACME"
          hint="Numbers become INV-PREFIX-0001. Leave blank to derive from the company name."
        />
        <Field
          label="Billing cadence"
          htmlFor="billingCadenceDays"
          hint="The tick prepares the next draft this many days after the latest invoice (starts from your first manual invoice)."
          className="span-2"
        >
          <Select
            id="billingCadenceDays"
            name={cadenceField.name}
            value={cadenceField.value == null ? "" : String(cadenceField.value)}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              cadenceField.onChange(e.target.value === "" ? null : Number(e.target.value))
            }
          >
            {CADENCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="span-2" style={{ marginTop: 4 }}>
          <Switch
            checked={remindersField.value ?? true}
            data-testid="toggle-overdue-reminders"
            onChange={(next: boolean) => remindersField.onChange(next)}
            label="Overdue payment reminder emails"
          />
          <p
            style={{
              margin: "6px 0 0 56px",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
              color: "var(--ink-soft)",
            }}
          >
            Applies only when the global overdue-reminder automation is on.
          </p>
        </div>
      </div>

      <Divider style={dividerStyle} />

      <Eyebrow index="05" style={sectionHeadStyle}>
        Notes
      </Eyebrow>
      <div className="form-grid">
        <FormTextarea
          control={control}
          name="notes"
          label="Notes"
          rows={4}
          placeholder="Internal notes about this client"
          className="span-2"
        />
      </div>

      {error && (
        <div style={{ marginTop: 20 }} role="alert">
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
        <Button href="/clients" variant="ghost">
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : clientId ? "Save changes" : "Create client"}
        </Button>
      </div>
    </form>
  );
}
