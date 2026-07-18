"use client";

import { useEffect, useRef, useState } from "react";
import { useController, type FieldValues } from "react-hook-form";
import { dollarsToCents } from "@/lib/money";
import { applyFieldBlur, applyFieldFocus, Field, Input, type BaseFieldProps } from "./shared";

export interface FormMoneyInputProps<T extends FieldValues> extends BaseFieldProps<T> {}

function centsToDollarString(cents: unknown): string {
  return typeof cents === "number" && Number.isFinite(cents) ? (cents / 100).toFixed(2) : "";
}

/**
 * Money field: the user types dollars ("90", "$1,234.56"), the form state
 * holds integer cents. A local string state keeps typing smooth; the display
 * normalizes to 2 decimal places on blur. Invalid text stores NaN so the zod
 * schema surfaces an error; empty stores undefined.
 */
export function FormMoneyInput<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  required,
  disabled,
  placeholder = "0.00",
  className,
}: FormMoneyInputProps<T>) {
  const { field, fieldState } = useController({ control, name });
  const [text, setText] = useState<string>(() => centsToDollarString(field.value));
  const focusedRef = useRef(false);

  // Sync the display when the form value changes externally (reset, server
  // refresh via `values:`) — but never while the user is typing.
  useEffect(() => {
    if (focusedRef.current) return;
    setText((current) => {
      if (typeof field.value === "number" && Number.isFinite(field.value)) {
        return dollarsToCents(current) === field.value ? current : centsToDollarString(field.value);
      }
      return field.value == null ? "" : current;
    });
  }, [field.value]);

  const invalid = !!fieldState.error;

  return (
    <Field
      label={label}
      htmlFor={name}
      required={required}
      hint={hint}
      error={fieldState.error?.message}
      className={className}
    >
      <Input
        id={name}
        name={field.name}
        type="text"
        inputMode="decimal"
        placeholder={placeholder}
        disabled={disabled}
        invalid={invalid}
        value={text}
        onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
          focusedRef.current = true;
          applyFieldFocus(e);
        }}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          const raw = e.target.value;
          setText(raw);
          if (raw.trim() === "") {
            field.onChange(undefined);
          } else {
            const cents = dollarsToCents(raw);
            field.onChange(cents === null ? NaN : cents);
          }
        }}
        onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
          focusedRef.current = false;
          applyFieldBlur(e, invalid);
          if (typeof field.value === "number" && Number.isFinite(field.value)) {
            setText(centsToDollarString(field.value));
          }
          field.onBlur();
        }}
      />
    </Field>
  );
}
