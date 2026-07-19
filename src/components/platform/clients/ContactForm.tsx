"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useController, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  contactSchema,
  CONTACT_ROLES,
  type ContactInput,
} from "@/lib/validations";
import { CONTACT_ROLE_LABEL } from "@/lib/bd-playbook";
import { upsertContact } from "@/actions/contacts";
import { FormTextInput, FormTextarea } from "@/components/form";
import { Field, Select } from "@/components/form/shared";
import { Button, Eyebrow, Divider, Switch } from "@/components/platform/ds";

const sectionHeadStyle: React.CSSProperties = { marginBottom: 16 };
const dividerStyle: React.CSSProperties = { margin: "28px 0" };

const EMPTY_CONTACT: ContactInput = {
  name: "",
  title: "",
  email: "",
  phone: "",
  role: null,
  reportsToId: null,
  notes: "",
  isPrimary: false,
};

export type ManagerOption = { value: string; label: string };

export function ContactForm({
  clientId,
  contact,
  contactId,
  managerOptions,
}: {
  clientId: string;
  contact: ContactInput | null;
  contactId?: string;
  managerOptions: ManagerOption[];
}) {
  const router = useRouter();
  const { control, handleSubmit } = useForm<ContactInput>({
    // isPrimary has a zod .default(), widening the input type; pin to output.
    resolver: zodResolver(contactSchema) as Resolver<ContactInput>,
    ...(contact ? { values: contact } : { defaultValues: EMPTY_CONTACT }),
  });

  // role and reportsTo are optional selects whose empty option is a real
  // choice ("none"), so they use the raw Select (FormSelect disables empty).
  const { field: roleField } = useController({ control, name: "role" });
  const { field: managerField } = useController({ control, name: "reportsToId" });
  const { field: primaryField } = useController({ control, name: "isPrimary" });

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (data: ContactInput) => {
    setError(null);
    startTransition(async () => {
      const result = await upsertContact(clientId, contactId ?? null, data);
      if (result.ok === false) {
        setError(result.error);
        return;
      }
      router.push(`/clients/${clientId}?tab=people`);
      router.refresh();
    });
  };

  return (
    <form className="form-card" onSubmit={handleSubmit(onSubmit)} noValidate>
      <Eyebrow index="01" style={sectionHeadStyle}>
        Person
      </Eyebrow>
      <div className="form-grid">
        <FormTextInput control={control} name="name" label="Name" required className="span-2" />
        <FormTextInput control={control} name="title" label="Title" placeholder="VP Engineering" />
        <Field label="Role in the deal" htmlFor="role">
          <Select
            id="role"
            name={roleField.name}
            value={roleField.value ?? ""}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              roleField.onChange(e.target.value === "" ? null : e.target.value)
            }
          >
            <option value="">— None yet —</option>
            {CONTACT_ROLES.map((r) => (
              <option key={r} value={r}>
                {CONTACT_ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        <FormTextInput control={control} name="email" label="Email" type="email" />
        <FormTextInput control={control} name="phone" label="Phone" type="tel" />
        <Field
          label="Reports to"
          htmlFor="reportsToId"
          hint="Builds the org chart on the People tab."
          className="span-2"
        >
          <Select
            id="reportsToId"
            name={managerField.name}
            value={managerField.value ?? ""}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              managerField.onChange(e.target.value === "" ? null : e.target.value)
            }
          >
            <option value="">— No manager (top of the org) —</option>
            {managerOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Divider style={dividerStyle} />

      <Eyebrow index="02" style={sectionHeadStyle}>
        What you know
      </Eyebrow>
      <div className="form-grid">
        <FormTextarea
          control={control}
          name="notes"
          label="Personality & politics"
          rows={5}
          placeholder="How they like to work, what they care about, who they trust, what makes them say no…"
          hint="Internal only — never shown to the client or on any invoice."
          className="span-2"
        />
        <div className="span-2" style={{ marginTop: 4 }}>
          <Switch
            checked={primaryField.value ?? false}
            data-testid="toggle-primary-contact"
            onChange={(next: boolean) => primaryField.onChange(next)}
            label="Primary contact for this client"
          />
        </div>
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
        <Button href={`/clients/${clientId}?tab=people`} variant="ghost">
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : contactId ? "Save changes" : "Add contact"}
        </Button>
      </div>
    </form>
  );
}
