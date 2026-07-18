"use client";

import { useController, type FieldValues } from "react-hook-form";
import { Field, Input, type BaseFieldProps } from "./shared";

export interface FormTextInputProps<T extends FieldValues> extends BaseFieldProps<T> {
  type?: "text" | "email" | "tel";
  autoComplete?: string;
}

/** Single-line text field wired to react-hook-form. */
export function FormTextInput<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  required,
  disabled,
  placeholder,
  className,
  type = "text",
  autoComplete,
}: FormTextInputProps<T>) {
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
        type={type}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        invalid={!!fieldState.error}
        value={field.value ?? ""}
        onChange={field.onChange}
      />
    </Field>
  );
}
