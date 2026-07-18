import React from 'react';

/**
 * Badge — small status/category marker. Tones map to the earthy
 * functional palette. Subtle by default (tinted, not loud).
 */
export function Badge({ children, tone = 'neutral', solid = false, style, ...rest }) {
  const tones = {
    neutral:  { bg: 'var(--stone-100)', fg: 'var(--ink-soft)',  line: 'var(--border-default)' },
    brand:    { bg: 'var(--sage-tint)', fg: 'var(--forest)',    line: 'var(--sage-line)' },
    accent:   { bg: 'var(--clay-tint)', fg: 'var(--clay-600)',  line: '#E2C3B1' },
    positive: { bg: '#E3EADF',          fg: 'var(--positive)',  line: '#C8D7C1' },
    caution:  { bg: '#F2E8D2',          fg: 'var(--caution)',   line: '#E4D2A8' },
    critical: { bg: '#F2DCD7',          fg: 'var(--critical)',  line: '#E5C2B9' },
  };
  const t = tones[tone] || tones.neutral;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--weight-medium)',
        lineHeight: 1,
        padding: '5px 10px',
        borderRadius: 'var(--radius-full)',
        background: solid ? t.fg : t.bg,
        color: solid ? '#FBF6EF' : t.fg,
        border: `1px solid ${solid ? 'transparent' : t.line}`,
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}
