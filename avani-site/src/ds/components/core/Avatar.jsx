import React from 'react';

/** Avatar — initials or image. Warm sage default, soft square or circle. */
export function Avatar({ name = '', src, size = 44, shape = 'circle', style, ...rest }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const radius = shape === 'circle' ? 'var(--radius-full)' : 'var(--radius-md)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: radius,
        overflow: 'hidden',
        flexShrink: 0,
        background: 'var(--sage-tint)',
        color: 'var(--forest)',
        fontFamily: 'var(--font-sans)',
        fontWeight: 'var(--weight-semibold)',
        fontSize: size * 0.4,
        letterSpacing: '0.01em',
        border: '1px solid var(--sage-line)',
        ...style,
      }}
      {...rest}
    >
      {src ? <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
    </span>
  );
}
