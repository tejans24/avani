'use client';
import React from 'react';

/** Switch — toggle for binary settings. Controlled or uncontrolled. */
export function Switch({ checked, defaultChecked = false, onChange, label, disabled = false, style, ...rest }) {
  const isControlled = checked !== undefined;
  const [internal, setInternal] = React.useState(defaultChecked);
  const on = isControlled ? checked : internal;

  const toggle = () => {
    if (disabled) return;
    if (!isControlled) setInternal(!on);
    onChange && onChange(!on);
  };

  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)', color: 'var(--ink)', ...style }}>
      <span
        role="switch"
        aria-checked={on}
        onClick={toggle}
        style={{
          position: 'relative',
          width: 44, height: 26, flexShrink: 0,
          borderRadius: 'var(--radius-full)',
          background: on ? 'var(--forest)' : 'var(--stone-300)',
          transition: 'background var(--dur-normal) var(--ease-standard)',
        }}
        {...rest}
      >
        <span style={{
          position: 'absolute', top: 3, left: on ? 21 : 3,
          width: 20, height: 20,
          borderRadius: 'var(--radius-full)',
          background: 'var(--warm-white)',
          boxShadow: 'var(--shadow-sm)',
          transition: 'left var(--dur-normal) var(--ease-out)',
        }} />
      </span>
      {label && <span>{label}</span>}
    </label>
  );
}
