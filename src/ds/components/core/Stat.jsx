import React from 'react';

/**
 * Stat — a single quantified proof point. Serif numeral, mono/sans
 * label below. Used in Proof sections; restraint over dashboards.
 */
export function Stat({ value, label, sublabel, align = 'left', onBrand = false, style, ...rest }) {
  return (
    <div style={{ textAlign: align, ...style }} {...rest}>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: 'clamp(2.5rem, 1.8rem + 2.4vw, 3.5rem)',
        lineHeight: 1,
        letterSpacing: 'var(--tracking-tight)',
        color: onBrand ? 'var(--text-on-brand)' : 'var(--ink)',
      }}>
        {value}
      </div>
      <div style={{
        marginTop: '12px',
        fontSize: 'var(--text-sm)',
        lineHeight: 1.45,
        color: onBrand ? 'var(--sage-soft)' : 'var(--text-secondary)',
        maxWidth: '24ch',
        marginLeft: align === 'center' ? 'auto' : 0,
        marginRight: align === 'center' ? 'auto' : 0,
      }}>
        <span style={{ fontWeight: 'var(--weight-semibold)', color: onBrand ? 'var(--text-on-brand)' : 'var(--ink)' }}>{label}</span>
        {sublabel && <span style={{ display: 'block', marginTop: 2 }}>{sublabel}</span>}
      </div>
    </div>
  );
}
