"use client";

import { Switch } from "@/components/platform/ds";

export type ColumnMapping = {
  date?: number;
  description?: number;
  amount?: number;
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-sm)",
  fontWeight: 500,
  color: "var(--ink)",
  marginBottom: 6,
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-base)",
  color: "var(--ink)",
  background: "var(--warm-white)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-md)",
};

const checkboxLabelStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-base)",
  color: "var(--ink)",
  cursor: "pointer",
};

function ColumnSelect({
  id,
  label,
  value,
  columns,
  onChange,
}: {
  id: string;
  label: string;
  value: number | undefined;
  columns: string[];
  onChange: (index: number | undefined) => void;
}) {
  return (
    <div>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      <select
        id={id}
        style={selectStyle}
        value={value === undefined ? "" : String(value)}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      >
        <option value="" disabled>
          Select column…
        </option>
        {columns.map((cell, i) => (
          <option key={i} value={String(i)}>
            Column {i + 1}
            {cell.trim() ? ` — ${cell.trim()}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Step 2 of the CSV wizard: map file columns and set import options. */
export function ColumnMapper({
  headerRow,
  mapping,
  onMappingChange,
  amountsAreCharges,
  onAmountsAreChargesChange,
  skipFirstRow,
  onSkipFirstRowChange,
}: {
  headerRow: string[];
  mapping: ColumnMapping;
  onMappingChange: (mapping: ColumnMapping) => void;
  amountsAreCharges: boolean;
  onAmountsAreChargesChange: (value: boolean) => void;
  skipFirstRow: boolean;
  onSkipFirstRowChange: (value: boolean) => void;
}) {
  return (
    <>
      <div className="form-grid">
        <ColumnSelect
          id="col-date"
          label="Date column"
          value={mapping.date}
          columns={headerRow}
          onChange={(date) => onMappingChange({ ...mapping, date })}
        />
        <ColumnSelect
          id="col-description"
          label="Description column"
          value={mapping.description}
          columns={headerRow}
          onChange={(description) => onMappingChange({ ...mapping, description })}
        />
        <ColumnSelect
          id="col-amount"
          label="Amount column"
          value={mapping.amount}
          columns={headerRow}
          onChange={(amount) => onMappingChange({ ...mapping, amount })}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 20 }}>
        <Switch
          checked={amountsAreCharges}
          onChange={onAmountsAreChargesChange}
          label="Amounts are charges (Amex-style: charges are positive in the file)"
        />
        <label style={checkboxLabelStyle}>
          <input
            id="skip-first-row"
            type="checkbox"
            checked={skipFirstRow}
            onChange={(e) => onSkipFirstRowChange(e.target.checked)}
          />
          First row is a header (skip it)
        </label>
      </div>
    </>
  );
}
