"use client";

import { useController, type FieldValues } from "react-hook-form";
import { Field, Input, type BaseFieldProps } from "./shared";

export interface FormDateInputProps<T extends FieldValues> extends BaseFieldProps<T> {
  min?: string;
  max?: string;
}

/**
 * Native date picker wired to react-hook-form. Form-state value is a
 * "YYYY-MM-DD" string (matching the zod schemas), never a Date.
 */
export function FormDateInput<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  required,
  disabled,
  className,
  min,
  max,
}: FormDateInputProps<T>) {
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
        type="date"
        min={min}
        max={max}
        disabled={disabled}
        invalid={!!fieldState.error}
        value={field.value ?? ""}
        onChange={field.onChange}
        style={{ colorScheme: "light" }}
      />
    </Field>
  );
}
