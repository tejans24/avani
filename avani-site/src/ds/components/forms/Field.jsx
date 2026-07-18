import React from 'react';

/** Field — label + optional hint/error wrapper for form controls. */
export function Field({ label, hint, error, htmlFor, required, children, style, ...rest }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', ...style }} {...rest}>
      {label && (
        <label htmlFor={htmlFor} style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-sm)',
          fontWeight: 'var(--weight-medium)',
          color: 'var(--ink)',
        }}>
          {label}
          {required && <span style={{ color: 'var(--clay)', marginLeft: 3 }}>*</span>}
        </label>
      )}
      {children}
      {(hint || error) && (
        <span style={{
          fontSize: 'var(--text-xs)',
          lineHeight: 1.4,
          color: error ? 'var(--critical)' : 'var(--text-muted)',
        }}>
          {error || hint}
        </span>
      )}
    </div>
  );
}
