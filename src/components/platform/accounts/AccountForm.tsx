"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useController, useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { accountSchema, type AccountInput } from "@/lib/validations";
import { setAccountArchived, upsertAccount } from "@/actions/accounts";
import { FormSelect, FormTextInput } from "@/components/form";
import { Button, Switch } from "@/components/platform/ds";

const EMPTY_ACCOUNT: AccountInput = {
  name: "",
  kind: "BANK",
  institution: "",
  mask: "",
  amountsAreCharges: false,
};

const KIND_OPTIONS = [
  { value: "BANK", label: "Bank" },
  { value: "CREDIT_CARD", label: "Credit card" },
];

export function AccountForm({
  account,
  accountId,
  archived = false,
}: {
  account: AccountInput | null;
  accountId?: string;
  archived?: boolean;
}) {
  const router = useRouter();
  const { control, handleSubmit, setValue } = useForm<AccountInput>({
    // amountsAreCharges has a zod .default(), which widens the schema's
    // *input* type. The form always holds the parsed shape, so pin the
    // resolver to the output type (same pattern as ClientForm).
    resolver: zodResolver(accountSchema) as Resolver<AccountInput>,
    ...(account ? { values: account } : { defaultValues: EMPTY_ACCOUNT }),
  });

  // Default "amounts are charges" on when the user picks Credit card
  // (Amex-style exports), off for Bank. Only reacts to actual kind changes so
  // an existing account's saved toggle isn't clobbered on load.
  const kind = useWatch({ control, name: "kind" });
  const prevKind = useRef(kind);
  useEffect(() => {
    if (prevKind.current !== kind) {
      prevKind.current = kind;
      setValue("amountsAreCharges", kind === "CREDIT_CARD");
    }
  }, [kind, setValue]);

  const { field: chargesField } = useController({ control, name: "amountsAreCharges" });

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (data: AccountInput) => {
    setError(null);
    startTransition(async () => {
      const result = await upsertAccount(accountId ?? null, data);
      // `=== false` (not `else`) so the union narrows under strict:false.
      if (result.ok === false) {
        setError(result.error);
        return;
      }
      router.push("/accounts");
      router.refresh();
    });
  };

  const onToggleArchived = () => {
    if (!accountId) return;
    setError(null);
    startTransition(async () => {
      const result = await setAccountArchived(accountId, !archived);
      if (result.ok === false) {
        setError(result.error);
        return;
      }
      router.push("/accounts");
      router.refresh();
    });
  };

  return (
    <form className="form-card" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="form-grid">
        <FormTextInput
          control={control}
          name="name"
          label="Name"
          required
          placeholder="Amex Gold"
          className="span-2"
        />
        <FormSelect control={control} name="kind" label="Kind" required options={KIND_OPTIONS} />
        <FormTextInput
          control={control}
          name="institution"
          label="Institution"
          required
          placeholder="American Express"
        />
        <FormTextInput
          control={control}
          name="mask"
          label="Last digits"
          hint="Last 4 digits shown as •••• 1234"
          placeholder="1234"
        />
        <div className="span-2" style={{ marginTop: 4 }}>
          <Switch
            checked={chargesField.value ?? false}
            onChange={(next: boolean) => chargesField.onChange(next)}
            label="Amounts are charges"
          />
          <p
            style={{
              margin: "6px 0 0 56px",
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
              color: "var(--ink-soft)",
            }}
          >
            Amex-style: charges are positive in the file
          </p>
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
        {accountId && (
          <Button type="button" variant="secondary" onClick={onToggleArchived} disabled={pending}>
            {archived ? "Unarchive" : "Archive"}
          </Button>
        )}
        <Button href="/accounts" variant="ghost">
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : accountId ? "Save changes" : "Create account"}
        </Button>
      </div>
    </form>
  );
}
