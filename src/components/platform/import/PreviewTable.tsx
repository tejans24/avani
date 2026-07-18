"use client";

import { formatCents } from "@/lib/money";
import { Badge } from "@/components/platform/ds";

export type PreviewRow = {
  index: number;
  /** "YYYY-MM-DD", or null when the date cell couldn't be parsed. */
  dateIso: string | null;
  description: string;
  /** Business-perspective signed cents, or null when the amount cell was invalid. */
  signedCents: number | null;
  /** Null for importable rows; otherwise why the row is excluded. */
  invalidReason: string | null;
};

/**
 * Step 3 of the CSV wizard: the parsed rows as they will import. Amounts are
 * shown ALREADY sign-normalized (negative = money out, positive = money in);
 * invalid rows are flagged with a reason and excluded from the import.
 */
export function PreviewTable({ rows }: { rows: PreviewRow[] }) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Description</th>
          <th className="num">Amount</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const excluded = row.invalidReason !== null;
          return (
            <tr key={row.index} style={excluded ? { opacity: 0.55 } : undefined}>
              <td>{row.dateIso ?? "—"}</td>
              <td>{row.description || "—"}</td>
              <td
                className="num"
                style={
                  row.signedCents === null
                    ? undefined
                    : {
                        color:
                          row.signedCents < 0 ? "var(--critical)" : "var(--positive)",
                      }
                }
              >
                {row.signedCents === null ? "—" : formatCents(row.signedCents)}
              </td>
              <td>
                {excluded ? (
                  <Badge tone="critical">{row.invalidReason}</Badge>
                ) : (
                  <Badge tone="neutral">Ready</Badge>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
