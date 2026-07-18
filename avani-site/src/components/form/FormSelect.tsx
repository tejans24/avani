"use client";

import { useController, type FieldValues } from "react-hook-form";
import { Field, Select, type BaseFieldProps } from "./shared";

export interface FormSelectOption {
  value: string;
  label: string;
}

export interface FormSelectProps<T extends FieldValues> extends BaseFieldProps<T> {
  options: FormSelectOption[];
}

/**
 * Native select wired to react-hook-form. Renders a disabled placeholder
 * option (empty value) so an unset field shows the placeholder text.
 */
export function FormSelect<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  required,
  disabled,
  placeholder = "Select…",
  className,
  options,
}: FormSelectProps<T>) {
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
      <Select
        id={name}
        name={field.name}
        disabled={disabled}
        invalid={!!fieldState.error}
        value={field.value ?? ""}
        onChange={field.onChange}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}
