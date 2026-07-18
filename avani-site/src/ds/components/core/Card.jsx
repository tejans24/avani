'use client';
import React from 'react';

/**
 * Card — primary surface container. Calm, warm, low-shadow.
 * Variants: surface (raised warm-white), sunken (cream), brand
 * (forest), outline (hairline only).
 */
export function Card({
  children,
  variant = 'surface',
  padding = 'lg',
  interactive = false,
  style,
  ...rest
}) {
  const pads = { none: 0, sm: 'var(--space-4)', md: 'var(--space-5)', lg: 'var(--space-6)', xl: 'var(--space-8)' };

  const variants = {
    surface: { background: 'var(--color-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)' },
    sunken:  { background: 'var(--color-surface-sunken)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', boxShadow: 'none' },
    brand:   { background: 'var(--forest)', color: 'var(--text-on-brand)', border: '1px solid var(--forest)', boxShadow: 'var(--shadow-md)' },
    outline: { background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border-default)', boxShadow: 'none' },
  };

  return (
    <div
      onMouseEnter={(e) => {
        if (!interactive) return;
        e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        if (!interactive) return;
        e.currentTarget.style.boxShadow = variants[variant].boxShadow;
        e.currentTarget.style.transform = 'none';
      }}
      style={{
        borderRadius: 'var(--radius-lg)',
        padding: pads[padding],
        cursor: interactive ? 'pointer' : 'default',
        transition: 'box-shadow var(--dur-normal) var(--ease-out), transform var(--dur-normal) var(--ease-out)',
        ...variants[variant],
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
