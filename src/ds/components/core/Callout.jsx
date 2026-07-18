import React from 'react';

/**
 * Callout — a quiet emphasized note. A left rule (not a colored
 * box) carries the accent; restraint over decoration.
 */
export function Callout({ children, tone = 'brand', icon, style, ...rest }) {
  const tones = {
    brand:  { rule: 'var(--sage)',  fg: 'var(--ink)' },
    accent: { rule: 'var(--clay)',  fg: 'var(--ink)' },
    muted:  { rule: 'var(--stone-300)', fg: 'var(--ink-soft)' },
  };
  const t = tones[tone] || tones.brand;
  return (
    <div
      style={{
        display: 'flex',
        gap: '16px',
        padding: '4px 0 4px 20px',
        borderLeft: `2px solid ${t.rule}`,
        color: t.fg,
        ...style,
      }}
      {...rest}
    >
      {icon && <span style={{ color: t.rule, flexShrink: 0, marginTop: 2 }}>{icon}</span>}
      <div style={{ fontSize: 'var(--text-lg)', lineHeight: 'var(--leading-normal)', fontFamily: 'var(--font-display)', fontStyle: 'italic', color: 'var(--ink-soft)' }}>
        {children}
      </div>
    </div>
  );
}
