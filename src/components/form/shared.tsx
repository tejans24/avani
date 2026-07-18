"use client";

import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { Field as DsField } from "@/ds/components/forms/Field";
import { Input as DsInput, Textarea as DsTextarea } from "@/ds/components/forms/Input";
import { Select as DsSelect } from "@/ds/components/forms/Select";

/**
 * The ds primitives are plain untyped JSX, so TypeScript infers every
 * destructured prop as required. Re-export them loosely typed for internal
 * use so consumers of this library get clean typechecks.
 */
type LooseComponent = React.ComponentType<any>;
export const Field: LooseComponent = DsField;
export const Input: LooseComponent = DsInput;
export const Textarea: LooseComponent = DsTextarea;
export const Select: LooseComponent = DsSelect;

/**
 * Internal helpers shared by the form components. The ds Input/Select spread
 * `...rest` after their own onFocus/onBlur, so any component that supplies its
 * own handlers must replicate the token-based focus styling itself.
 */

export interface BaseFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Extra class on the Field wrapper (e.g. "span-2" inside .form-grid). */
  className?: string;
}

type FocusableEl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/** Mirror of the ds field focus style (border + focus ring). */
export function applyFieldFocus(e: React.FocusEvent<FocusableEl>) {
  e.currentTarget.style.borderColor = "var(--clay)";
  e.currentTarget.style.boxShadow = "var(--shadow-focus)";
}

/** Mirror of the ds field blur style (restores resting border). */
export function applyFieldBlur(e: React.FocusEvent<FocusableEl>, invalid: boolean) {
  e.currentTarget.style.borderColor = invalid ? "var(--critical)" : "var(--border-default)";
  e.currentTarget.style.boxShadow = "none";
}
