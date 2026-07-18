"use client";

import { useController, type FieldValues } from "react-hook-form";
import { Field, Textarea, type BaseFieldProps } from "./shared";

export interface FormTextareaProps<T extends FieldValues> extends BaseFieldProps<T> {
  rows?: number;
}

/** Multi-line text field wired to react-hook-form. */
export function FormTextarea<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  required,
  disabled,
  placeholder,
  className,
  rows = 4,
}: FormTextareaProps<T>) {
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
      <Textarea
        id={name}
        name={field.name}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
        invalid={!!fieldState.error}
        value={field.value ?? ""}
        onChange={field.onChange}
      />
    </Field>
  );
}
