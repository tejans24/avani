'use client';
import React from 'react';

/** Select — native dropdown styled to match the field system. */
export function Select({ children, invalid = false, style, ...rest }) {
  return (
    <div style={{ position: 'relative', display: 'inline-flex', width: '100%' }}>
      <select
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--clay)'; e.currentTarget.style.boxShadow = 'var(--shadow-focus)'; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.boxShadow = 'none'; }}
        style={{
          width: '100%',
          appearance: 'none',
          WebkitAppearance: 'none',
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--text-base)',
          color: 'var(--ink)',
          background: 'var(--warm-white)',
          border: `1px solid ${invalid ? 'var(--critical)' : 'var(--border-default)'}`,
          borderRadius: 'var(--radius-md)',
          padding: '11px 38px 11px 14px',
          outline: 'none',
          cursor: 'pointer',
          transition: 'border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)',
          ...style,
        }}
        {...rest}
      >
        {children}
      </select>
      <span aria-hidden style={{
        position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
        pointerEvents: 'none', color: 'var(--ink-muted)', fontSize: 12,
      }}>▾</span>
    </div>
  );
}
