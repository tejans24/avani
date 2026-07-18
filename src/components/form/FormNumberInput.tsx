"use client";

import { useController, type FieldValues } from "react-hook-form";
import { Field, Input, type BaseFieldProps } from "./shared";

export interface FormNumberInputProps<T extends FieldValues> extends BaseFieldProps<T> {
  step?: number | "any";
  min?: number;
  max?: number;
}

/**
 * Numeric field wired to react-hook-form. Stores a number in form state
 * (empty input becomes undefined so zod reports "required" rather than NaN).
 */
export function FormNumberInput<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  required,
  disabled,
  placeholder,
  className,
  step,
  min,
  max,
}: FormNumberInputProps<T>) {
  const { field, fieldState } = useController({ control, name });
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
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        placeholder={placeholder}
        disabled={disabled}
        invalid={!!fieldState.error}
        value={field.value ?? ""}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          const raw = e.target.value;
          field.onChange(raw === "" ? undefined : Number(raw));
        }}
      />
    </Field>
  );
}
