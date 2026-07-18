"use client";

import { Fragment, useState } from "react";
import { formatCents } from "@/lib/money";
import { formatDateShort } from "@/lib/dates";
import { Badge } from "@/components/platform/ds";
import {
  CategorySelect,
  RuleStrip,
  type CategoryOption,
  type RulePrompt,
} from "./CategorySelect";
import { BulkBar } from "./BulkBar";

export type TxnRow = {
  id: string;
  postedAt: string; // "YYYY-MM-DD"
  accountName: string;
  description: string;
  merchant: string | null;
  amountCents: number;
  categoryId: string | null;
  status: "UNREVIEWED" | "REVIEWED" | "EXCLUDED";
};

const STATUS_BADGE: Record<TxnRow["status"], { tone: string; label: string }> = {
  UNREVIEWED: { tone: "caution", label: "Unreviewed" },
  REVIEWED: { tone: "positive", label: "Reviewed" },
  EXCLUDED: { tone: "neutral", label: "Excluded" },
};

export function TransactionsTable({
  rows,
  categories,
  uncategorizedCount,
}: {
  rows: TxnRow[];
  categories: CategoryOption[];
  uncategorizedCount: number;
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [rulePrompt, setRulePrompt] = useState<RulePrompt | null>(null);

  if (rows.length === 0) {
    return <div className="empty-state">No transactions match this filter.</div>;
  }

  const selectedIds = rows.filter((r) => selected[r.id]).map((r) => r.id);
  const allSelected = selectedIds.length === rows.length;

  const toggleAll = (checked: boolean) => {
    if (!checked) {
      setSelected({});
      return;
    }
    const all: Record<string, boolean> = {};
    for (const r of rows) all[r.id] = true;
    setSelected(all);
  };

  return (
    <>
      {selectedIds.length > 0 && (
        <BulkBar ids={selectedIds} categories={categories} onClear={() => setSelected({})} />
      )}
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ width: 36 }}>
              <input
                type="checkbox"
                aria-label="Select all"
                checked={allSelected}
                onChange={(e) => toggleAll(e.target.checked)}
              />
            </th>
            <th>Date</th>
            <th>Account</th>
            <th>Description</th>
            <th className="num">Amount</th>
            <th>Category</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const badge = STATUS_BADGE[t.status];
            return (
              <Fragment key={t.id}>
                <tr>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${t.description}`}
                      checked={!!selected[t.id]}
                      onChange={(e) =>
                        setSelected({ ...selected, [t.id]: e.target.checked })
                      }
                    />
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>{formatDateShort(t.postedAt)}</td>
                  <td>{t.accountName}</td>
                  <td>
                    {t.description}
                    {t.merchant && (
                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "var(--text-xs)",
                          marginTop: 2,
                        }}
                      >
                        {t.merchant}
                      </div>
                    )}
                  </td>
                  <td
                    className="num"
                    style={t.amountCents > 0 ? { color: "var(--positive)" } : undefined}
                  >
                    {formatCents(t.amountCents)}
                  </td>
                  <td style={{ minWidth: 190 }}>
                    <CategorySelect
                      transactionId={t.id}
                      value={t.categoryId}
                      categories={categories}
                      description={t.description}
                      merchant={t.merchant}
                      onCategorized={setRulePrompt}
                    />
                  </td>
                  <td>
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </td>
                </tr>
                {rulePrompt && rulePrompt.transactionId === t.id && (
                  <tr>
                    <td colSpan={7} style={{ background: "var(--cream)" }}>
                      <RuleStrip
                        prompt={rulePrompt}
                        uncategorizedCount={uncategorizedCount}
                        onClose={() => setRulePrompt(null)}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
