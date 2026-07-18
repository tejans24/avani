"use client";

import { useFieldArray, useWatch, type Control } from "react-hook-form";
import type { InvoiceInput } from "@/lib/validations";
import { computeLineAmountCents, formatCents } from "@/lib/money";
import { FormTextInput, FormNumberInput, FormMoneyInput } from "@/components/form";
import { Button } from "@/components/platform/ds";

const GRID_COLUMNS = "6fr 1.2fr 1.6fr 1.8fr 44px";

const rowGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: GRID_COLUMNS,
  gap: 10,
  alignItems: "start",
};

const headerCellStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: 12,
  fontWeight: "var(--weight-medium)" as React.CSSProperties["fontWeight"],
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  color: "var(--text-muted)",
};

/** The forms library renders no <label> when `label` is omitted; these hidden
 *  labels (htmlFor = the input's id) supply accessible names instead. */
const visuallyHidden: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

/** Matches the rendered height of the ds inputs so plain-text cells center. */
const cellCenterStyle: React.CSSProperties = {
  minHeight: 44,
  display: "flex",
  alignItems: "center",
};

function RowAmount({ control, index }: { control: Control<InvoiceInput>; index: number }) {
  const row = useWatch({ control, name: `lineItems.${index}` as const });
  const quantity = Number(row?.quantity);
  const unitPriceCents = Number(row?.unitPriceCents);
  const complete =
    Number.isFinite(quantity) && quantity > 0 && Number.isFinite(unitPriceCents) && unitPriceCents >= 0;

  return (
    <div style={{ ...cellCenterStyle, justifyContent: "flex-end" }}>
      <span
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-base)",
          fontVariantNumeric: "tabular-nums",
          color: complete ? "var(--text-primary)" : "var(--text-muted)",
        }}
      >
        {complete ? formatCents(computeLineAmountCents(quantity, unitPriceCents)) : "—"}
      </span>
    </div>
  );
}

export function LineItemsEditor({ control }: { control: Control<InvoiceInput> }) {
  const { fields, append, remove } = useFieldArray({ control, name: "lineItems" });

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ ...rowGridStyle, marginBottom: 8 }}>
        <span style={headerCellStyle}>Description</span>
        <span style={headerCellStyle}>Hours</span>
        <span style={headerCellStyle}>Rate</span>
        <span style={{ ...headerCellStyle, textAlign: "right" }}>Amount</span>
        <span aria-hidden="true" />
      </div>

      {fields.map((row, index) => (
        <div key={row.id} style={{ ...rowGridStyle, marginBottom: 10 }}>
          <div>
            <label htmlFor={`lineItems.${index}.description`} style={visuallyHidden}>
              Description
            </label>
            <FormTextInput
              control={control}
              name={`lineItems.${index}.description` as const}
              placeholder="Describe the work"
            />
          </div>
          <div>
            <label htmlFor={`lineItems.${index}.quantity`} style={visuallyHidden}>
              Hours
            </label>
            <FormNumberInput
              control={control}
              name={`lineItems.${index}.quantity` as const}
              step="any"
              min={0}
              placeholder="0"
            />
          </div>
          <div>
            <label htmlFor={`lineItems.${index}.unitPriceCents`} style={visuallyHidden}>
              Rate
            </label>
            <FormMoneyInput control={control} name={`lineItems.${index}.unitPriceCents` as const} />
          </div>
          <RowAmount control={control} index={index} />
          <div style={cellCenterStyle}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Remove line"
              disabled={fields.length <= 1}
              onClick={() => remove(index)}
              style={{ padding: "8px 10px", visibility: fields.length <= 1 ? "hidden" : "visible" }}
            >
              ✕
            </Button>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() =>
          append({
            description: "",
            quantity: undefined as unknown as number,
            unitPriceCents: undefined as unknown as number,
          })
        }
        style={{ marginTop: 4 }}
      >
        Add line
      </Button>
    </div>
  );
}
