"use client";

import { useEffect, useRef, useState } from "react";
import { useController, type FieldError, type FieldValues } from "react-hook-form";
import { applyFieldBlur, applyFieldFocus, Field, Input, type BaseFieldProps } from "./shared";

export interface FormEmailListInputProps<T extends FieldValues> extends BaseFieldProps<T> {}

function parseEmails(text: string): string[] {
  return text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** First useful message from an array-field error (root or per-item). */
function listErrorMessage(error: unknown): string | undefined {
  if (!error) return undefined;
  const err = error as FieldError & { [index: number]: FieldError | undefined };
  if (err.message) return err.message;
  if (Array.isArray(error)) {
    return (error as (FieldError | undefined)[]).find((e) => e?.message)?.message;
  }
  return undefined;
}

/**
 * Comma-separated email list: form state holds string[]. Splits on commas,
 * trims, drops empties; the parsed addresses echo below the input as text.
 */
export function FormEmailListInput<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  required,
  disabled,
  placeholder = "one@example.com, two@example.com",
  className,
}: FormEmailListInputProps<T>) {
  const { field, fieldState } = useController({ control, name });
  const [text, setText] = useState<string>(() =>
    Array.isArray(field.value) ? field.value.join(", ") : ""
  );
  const focusedRef = useRef(false);

  // Keep the display in sync with external value changes (reset/server refresh).
  useEffect(() => {
    if (focusedRef.current) return;
    const value: string[] = Array.isArray(field.value) ? field.value : [];
    setText((current) =>
      parseEmails(current).join(",") === value.join(",") ? current : value.join(", ")
    );
  }, [field.value]);

  const invalid = !!fieldState.error;
  const emails: string[] = Array.isArray(field.value) ? field.value : [];
  const echo = emails.length > 0 ? emails.join(", ") : undefined;

  return (
    <Field
      label={label}
      htmlFor={name}
      required={required}
      hint={listErrorMessage(fieldState.error) ? undefined : (echo ?? hint)}
      error={listErrorMessage(fieldState.error)}
      className={className}
    >
      <Input
        id={name}
        name={field.name}
        type="text"
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
          field.onChange(parseEmails(raw));
        }}
        onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
          focusedRef.current = false;
          applyFieldBlur(e, invalid);
          field.onBlur();
        }}
      />
    </Field>
  );
}
