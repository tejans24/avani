import React from 'react';

/** Divider — quiet hairline. Horizontal by default; optional centered label. */
export function Divider({ label, vertical = false, style, ...rest }) {
  if (vertical) {
    return <span aria-hidden style={{ display: 'inline-block', width: 1, alignSelf: 'stretch', background: 'var(--border-default)', ...style }} {...rest} />;
  }
  if (label) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', ...style }} {...rest}>
        <span style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
      </div>
    );
  }
  return <hr style={{ border: 0, height: 1, background: 'var(--border-default)', margin: 0, ...style }} {...rest} />;
}
