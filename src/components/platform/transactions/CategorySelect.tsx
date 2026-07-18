"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/ds/components/forms/Select";
import { Input } from "@/ds/components/forms/Input";
import { Button } from "@/components/platform/ds";
import { setTransactionCategory } from "@/actions/transactions";
import { createRuleFromTransaction } from "@/actions/categories";

export type CategoryOption = { id: string; name: string };

/** Payload handed up after an inline categorize so the table can show RuleStrip. */
export type RulePrompt = {
  transactionId: string;
  categoryId: string;
  pattern: string;
  field: "DESCRIPTION" | "MERCHANT";
};

const compactField = { padding: "6px 10px", fontSize: "var(--text-sm)" };
const compactSelect = { padding: "6px 28px 6px 10px", fontSize: "var(--text-sm)" };

/**
 * Inline per-row category picker. Choosing a category calls
 * setTransactionCategory (which also flips UNREVIEWED → REVIEWED) and then
 * offers rule creation via onCategorized → RuleStrip.
 */
export function CategorySelect({
  transactionId,
  value,
  categories,
  description,
  merchant,
  onCategorized,
}: {
  transactionId: string;
  value: string | null;
  categories: CategoryOption[];
  description: string;
  merchant: string | null;
  onCategorized: (prompt: RulePrompt) => void;
}) {
  const router = useRouter();
  const [val, setVal] = useState(value ?? "");
  const [pending, startTransition] = useTransition();

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    const prev = val;
    setVal(next);
    startTransition(async () => {
      const result = await setTransactionCategory(transactionId, next || null);
      // `=== false` (not `else`) so the union narrows under strict:false.
      if (result.ok === false) {
        setVal(prev);
        return;
      }
      if (next) {
        onCategorized({
          transactionId,
          categoryId: next,
          // Prefill from merchant when present (and match on MERCHANT),
          // otherwise fall back to the description.
          pattern: merchant ?? description,
          field: merchant ? "MERCHANT" : "DESCRIPTION",
        });
      }
      router.refresh();
    });
  };

  return (
    <Select
      aria-label={`Category for ${description}`}
      value={val}
      onChange={onChange}
      disabled={pending}
      style={compactSelect}
    >
      <option value="">Uncategorized</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </Select>
  );
}

/**
 * Transient "Create rule from this?" strip shown under a row right after an
 * inline categorize. Dismissible; creating the rule optionally re-applies all
 * rules to existing uncategorized transactions.
 */
export function RuleStrip({
  prompt,
  uncategorizedCount,
  onClose,
}: {
  prompt: RulePrompt;
  uncategorizedCount: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pattern, setPattern] = useState(prompt.pattern);
  const [applyToExisting, setApplyToExisting] = useState(true);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await createRuleFromTransaction({
        field: prompt.field,
        matchType: "SUBSTRING",
        pattern: pattern.trim(),
        categoryId: prompt.categoryId,
        priority: 100,
        applyToExisting,
      });
      if (result.ok === false) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-sm)",
        color: "var(--text-primary)",
      }}
    >
      <span style={{ fontWeight: 500 }}>Create rule from this?</span>
      <div style={{ width: 260 }}>
        <Input
          aria-label="Rule pattern"
          value={pattern}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPattern(e.target.value)}
          style={compactField}
        />
      </div>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={applyToExisting}
          onChange={(e) => setApplyToExisting(e.target.checked)}
        />
        Also apply to {uncategorizedCount} existing uncategorized
      </label>
      <Button
        type="button"
        size="sm"
        variant="primary"
        disabled={pending || !pattern.trim()}
        onClick={submit}
      >
        {pending ? "Creating…" : "Create rule"}
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onClose}>
        No thanks
      </Button>
      {error && (
        <span role="alert" style={{ color: "var(--critical)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
