"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useController, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  interactionSchema,
  INTERACTION_TYPES,
  INTERACTION_DIRECTIONS,
  type InteractionInput,
} from "@/lib/validations";
import {
  INTERACTION_TYPE_LABEL,
  INTERACTION_DIRECTION_LABEL,
} from "@/lib/bd-playbook";
import { createInteraction } from "@/actions/interactions";
import { FormTextInput, FormTextarea, FormSelect, FormDateInput } from "@/components/form";
import { Field, Select } from "@/components/form/shared";
import { Button } from "@/components/platform/ds";

export type ComposerContact = { id: string; name: string };

export function InteractionComposer({
  clientId,
  contacts,
  defaultDate,
}: {
  clientId: string;
  contacts: ComposerContact[];
  defaultDate: string;
}) {
  const router = useRouter();
  const { control, handleSubmit, reset } = useForm<InteractionInput>({
    // direction has a zod .default(); pin the resolver to the output shape.
    resolver: zodResolver(interactionSchema) as Resolver<InteractionInput>,
    defaultValues: {
      type: "CALL",
      direction: "OUTBOUND",
      occurredAt: defaultDate,
      contactId: null,
      subject: "",
      body: "",
    },
  });

  const { field: contactField } = useController({ control, name: "contactId" });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (data: InteractionInput) => {
    setError(null);
    startTransition(async () => {
      const result = await createInteraction(clientId, data);
      if (result.ok === false) {
        setError(result.error);
        return;
      }
      reset({
        type: "CALL",
        direction: "OUTBOUND",
        occurredAt: defaultDate,
        contactId: null,
        subject: "",
        body: "",
      });
      router.refresh();
    });
  };

  return (
    <form
      className="form-card"
      style={{ marginBottom: 24 }}
      onSubmit={handleSubmit(onSubmit)}
      noValidate
    >
      <div className="form-grid">
        <FormSelect
          control={control}
          name="type"
          label="What happened"
          options={INTERACTION_TYPES.map((t) => ({ value: t, label: INTERACTION_TYPE_LABEL[t] }))}
        />
        <FormSelect
          control={control}
          name="direction"
          label="Direction"
          options={INTERACTION_DIRECTIONS.map((d) => ({
            value: d,
            label: INTERACTION_DIRECTION_LABEL[d],
          }))}
        />
        <FormDateInput control={control} name="occurredAt" label="Date" required />
        <Field label="With (contact)" htmlFor="contactId">
          <Select
            id="contactId"
            name={contactField.name}
            value={contactField.value ?? ""}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              contactField.onChange(e.target.value === "" ? null : e.target.value)
            }
          >
            <option value="">— No specific contact —</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <FormTextInput
          control={control}
          name="subject"
          label="Subject"
          placeholder="Intro call, proposal review…"
          className="span-2"
        />
        <FormTextarea
          control={control}
          name="body"
          label="Notes"
          rows={3}
          placeholder="What was said, what you agreed, what's next…"
          className="span-2"
        />
      </div>

      {error && (
        <div style={{ marginTop: 16 }} role="alert">
          <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--critical)" }}>{error}</p>
        </div>
      )}

      <div className="form-actions">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Logging…" : "Log interaction"}
        </Button>
      </div>
    </form>
  );
}
