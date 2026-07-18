import React from 'react';

/**
 * Eyebrow — small mono label above a heading. Often numbered
 * (e.g. "01 / What I do"). Carries the technical-precision note.
 */
export function Eyebrow({ children, index, tone = 'brand', style, ...rest }) {
  const colors = {
    brand:   'var(--eyebrow)',
    accent:  'var(--color-accent)',
    muted:   'var(--text-muted)',
    onBrand: 'var(--sage-soft)',
  };
  return (
    <p
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-label)',
        fontWeight: 'var(--weight-medium)',
        letterSpacing: 'var(--tracking-label)',
        textTransform: 'uppercase',
        color: colors[tone],
        margin: 0,
        ...style,
      }}
      {...rest}
    >
      {index != null && (
        <>
          <span>{index}</span>
          <span aria-hidden style={{ width: 22, height: 1, background: 'currentColor', opacity: 0.5 }} />
        </>
      )}
      <span>{children}</span>
    </p>
  );
}
