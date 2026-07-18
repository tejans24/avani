'use client';
import React from 'react';

const fieldBase = {
  width: '100%',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--text-base)',
  color: 'var(--ink)',
  background: 'var(--warm-white)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  padding: '11px 14px',
  outline: 'none',
  transition: 'border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)',
};

function focusOn(e) {
  e.currentTarget.style.borderColor = 'var(--clay)';
  e.currentTarget.style.boxShadow = 'var(--shadow-focus)';
}
function focusOff(e) {
  e.currentTarget.style.borderColor = 'var(--border-default)';
  e.currentTarget.style.boxShadow = 'none';
}

/** Input — single-line text field. */
export function Input({ invalid = false, style, ...rest }) {
  return (
    <input
      onFocus={focusOn}
      onBlur={focusOff}
      style={{ ...fieldBase, borderColor: invalid ? 'var(--critical)' : fieldBase.border, ...style }}
      {...rest}
    />
  );
}

/** Textarea — multi-line text field. */
export function Textarea({ rows = 4, invalid = false, style, ...rest }) {
  return (
    <textarea
      rows={rows}
      onFocus={focusOn}
      onBlur={focusOff}
      style={{ ...fieldBase, resize: 'vertical', lineHeight: 'var(--leading-normal)', ...style }}
      {...rest}
    />
  );
}
