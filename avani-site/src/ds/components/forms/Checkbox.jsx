'use client';
import React from 'react';

/** Checkbox — square control with warm sage check. */
export function Checkbox({ label, checked, defaultChecked, style, ...rest }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)', color: 'var(--ink)', ...style }}>
      <input
        type="checkbox"
        checked={checked}
        defaultChecked={defaultChecked}
        style={{
          appearance: 'none', WebkitAppearance: 'none',
          width: 20, height: 20, margin: 0, flexShrink: 0,
          borderRadius: 'var(--radius-xs)',
          border: '1.5px solid var(--border-strong)',
          background: 'var(--warm-white)',
          display: 'grid', placeContent: 'center',
          cursor: 'pointer',
          transition: 'background var(--dur-fast), border-color var(--dur-fast)',
        }}
        onChange={(e) => {
          e.currentTarget.style.background = e.currentTarget.checked ? 'var(--forest)' : 'var(--warm-white)';
          e.currentTarget.style.borderColor = e.currentTarget.checked ? 'var(--forest)' : 'var(--border-strong)';
        }}
        ref={(el) => { if (el) { el.style.background = el.checked ? 'var(--forest)' : 'var(--warm-white)'; el.style.borderColor = el.checked ? 'var(--forest)' : 'var(--border-strong)'; } }}
        {...rest}
      />
      {label && <span>{label}</span>}
    </label>
  );
}

/** Radio — round single-select control. */
export function Radio({ label, name, checked, defaultChecked, style, ...rest }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)', color: 'var(--ink)', ...style }}>
      <input
        type="radio"
        name={name}
        checked={checked}
        defaultChecked={defaultChecked}
        style={{
          appearance: 'none', WebkitAppearance: 'none',
          width: 20, height: 20, margin: 0, flexShrink: 0,
          borderRadius: 'var(--radius-full)',
          border: '1.5px solid var(--border-strong)',
          background: 'var(--warm-white)',
          display: 'grid', placeContent: 'center',
          cursor: 'pointer',
          boxShadow: 'inset 0 0 0 0 var(--warm-white)',
          transition: 'box-shadow var(--dur-fast), border-color var(--dur-fast)',
        }}
        onChange={(e) => {
          const on = e.currentTarget.checked;
          e.currentTarget.style.borderColor = on ? 'var(--forest)' : 'var(--border-strong)';
          e.currentTarget.style.boxShadow = on ? 'inset 0 0 0 5px var(--forest)' : 'inset 0 0 0 0 var(--warm-white)';
        }}
        {...rest}
      />
      {label && <span>{label}</span>}
    </label>
  );
}
