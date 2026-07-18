'use client';
import React from 'react';

/**
 * IconButton — square, low-chrome control for a single icon.
 * Variants: ghost (default), outline, solid (forest).
 */
export function IconButton({
  children,
  label,
  variant = 'ghost',
  size = 'md',
  disabled = false,
  style,
  ...rest
}) {
  const dims = { sm: 32, md: 40, lg: 48 }[size];

  const variants = {
    ghost:   { background: 'transparent', color: 'var(--ink-soft)', border: '1px solid transparent' },
    outline: { background: 'transparent', color: 'var(--ink)', border: '1px solid var(--border-default)' },
    solid:   { background: 'var(--forest)', color: 'var(--text-on-brand)', border: '1px solid var(--forest)' },
  };
  const hoverBg = { ghost: 'var(--cream)', outline: 'var(--cream)', solid: 'var(--forest-600)' };

  return (
    <button
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseEnter={(e) => !disabled && (e.currentTarget.style.background = hoverBg[variant])}
      onMouseLeave={(e) => !disabled && (e.currentTarget.style.background = variants[variant].background)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: dims,
        height: dims,
        borderRadius: 'var(--radius-md)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'background var(--dur-fast) var(--ease-standard)',
        ...variants[variant],
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
