"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/platform/ds";
import { Select } from "@/ds/components/forms/Select";
import { bulkUpdateTransactions } from "@/actions/transactions";
import type { CategoryOption } from "./CategorySelect";

type BulkPatch = {
  categoryId?: string | null;
  status?: "UNREVIEWED" | "REVIEWED" | "EXCLUDED";
};

/** Action bar shown above the table while any rows are checked. */
export function BulkBar({
  ids,
  categories,
  onClear,
}: {
  ids: string[];
  categories: CategoryOption[];
  onClear: () => void;
}) {
  const [categoryId, setCategoryId] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (patch: BulkPatch) => {
    setError(null);
    startTransition(async () => {
      const result = await bulkUpdateTransactions(ids, patch);
      // `=== false` (not `else`) so the union narrows under strict:false.
      if (result.ok === false) {
        setError(result.error);
        return;
      }
      // revalidatePath in the action streams the refreshed page back with the
      // POST response — no explicit router.refresh() needed (and an extra
      // in-transition refresh races it on Next 14.2).
      onClear();
    });
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        padding: "10px 14px",
        marginBottom: 12,
        background: "var(--cream)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-md)",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-sm)",
        color: "var(--text-primary)",
      }}
    >
      <span style={{ fontWeight: 500 }}>{ids.length} selected</span>
      <div style={{ width: 210 }}>
        <Select
          aria-label="Bulk category"
          value={categoryId}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCategoryId(e.target.value)}
          style={{ padding: "6px 28px 6px 10px", fontSize: "var(--text-sm)" }}
        >
          <option value="">Category…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={pending || !categoryId}
        onClick={() => run({ categoryId })}
      >
        Apply
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => run({ status: "REVIEWED" })}
      >
        Mark reviewed
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => run({ status: "EXCLUDED" })}
      >
        Exclude
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onClear}>
        Clear
      </Button>
      {error && (
        <span role="alert" style={{ color: "var(--critical)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
