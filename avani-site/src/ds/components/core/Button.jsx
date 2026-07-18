'use client';
import React from 'react';

/**
 * Avani Button — calm, substantial, restrained.
 * Variants: primary (forest), accent (clay), secondary (outline),
 * ghost (text). Sizes: sm, md, lg.
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  as = 'button',
  href,
  iconLeft,
  iconRight,
  disabled = false,
  fullWidth = false,
  style,
  ...rest
}) {
  const sizes = {
    sm: { fontSize: 'var(--text-sm)',   padding: '8px 16px',  gap: '7px' },
    md: { fontSize: 'var(--text-base)', padding: '12px 22px', gap: '9px' },
    lg: { fontSize: 'var(--text-lg)',   padding: '15px 30px', gap: '10px' },
  };

  const variants = {
    primary: {
      background: 'var(--forest)',
      color: 'var(--text-on-brand)',
      border: '1px solid var(--forest)',
    },
    accent: {
      background: 'var(--clay)',
      color: '#FBF6EF',
      border: '1px solid var(--clay)',
    },
    secondary: {
      background: 'transparent',
      color: 'var(--ink)',
      border: '1px solid var(--border-strong)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--ink-soft)',
      border: '1px solid transparent',
    },
  };

  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: fullWidth ? '100%' : 'auto',
    fontFamily: 'var(--font-sans)',
    fontWeight: 'var(--weight-medium)',
    lineHeight: 1,
    letterSpacing: '0.005em',
    borderRadius: 'var(--radius-md)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    transition: 'background var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-standard)',
    ...sizes[size],
    ...variants[variant],
    ...style,
  };

  const hoverBg = {
    primary: 'var(--forest-600)',
    accent: 'var(--clay-600)',
    secondary: 'var(--cream)',
    ghost: 'var(--cream)',
  };

  const onEnter = (e) => {
    if (disabled) return;
    e.currentTarget.style.background = hoverBg[variant];
    if (variant === 'primary') e.currentTarget.style.borderColor = 'var(--forest-600)';
    if (variant === 'accent') e.currentTarget.style.borderColor = 'var(--clay-600)';
  };
  const onLeave = (e) => {
    if (disabled) return;
    e.currentTarget.style.background = variants[variant].background;
    e.currentTarget.style.borderColor = variants[variant].border.split(' ').pop();
  };
  const onDown = (e) => { if (!disabled) e.currentTarget.style.transform = 'translateY(1px)'; };
  const onUp = (e) => { if (!disabled) e.currentTarget.style.transform = 'none'; };

  const Tag = href ? 'a' : as;
  return (
    <Tag
      href={href}
      style={base}
      disabled={Tag === 'button' ? disabled : undefined}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onMouseDown={onDown}
      onMouseUp={onUp}
      {...rest}
    >
      {iconLeft && <span style={{ display: 'inline-flex' }}>{iconLeft}</span>}
      {children}
      {iconRight && <span style={{ display: 'inline-flex' }}>{iconRight}</span>}
    </Tag>
  );
}
