"use client";
import React from "react";

/* Hero backdrop: "dawn over living terrain".
   A slowly morphing topographic map (simplex noise → marching squares)
   that swells into a hill under the cursor, beneath a rising sun.
   Avani means "earth"; the sun + horizon echo the brand mark.
   Pauses off-screen / in hidden tabs; draws one still frame when the
   viewer prefers reduced motion. */

// ---- 3D simplex noise (after Stefan Gustavson's public-domain reference) ----
const GRAD3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

function makeNoise3(seed: number) {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = seed >>> 0;
  for (let i = 255; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const F3 = 1 / 3;
  const G3 = 1 / 6;

  return (x: number, y: number, z: number) => {
    const sk = (x + y + z) * F3;
    const i = Math.floor(x + sk);
    const j = Math.floor(y + sk);
    const k = Math.floor(z + sk);
    const t = (i + j + k) * G3;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const z0 = z - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 0.5, y3 = y0 - 1 + 0.5, z3 = z0 - 1 + 0.5;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    const corner = (gi: number, cx: number, cy: number, cz: number) => {
      let tt = 0.6 - cx * cx - cy * cy - cz * cz;
      if (tt < 0) return 0;
      const g = GRAD3[gi % 12];
      tt *= tt;
      return tt * tt * (g[0] * cx + g[1] * cy + g[2] * cz);
    };
    const n0 = corner(perm[ii + perm[jj + perm[kk]]], x0, y0, z0);
    const n1 = corner(perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]], x1, y1, z1);
    const n2 = corner(perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]], x2, y2, z2);
    const n3 = corner(perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]], x3, y3, z3);
    return 32 * (n0 + n1 + n2 + n3); // ≈ [-1, 1]
  };
}

// fixed precision so server and client render identical SVG attributes
const round2 = (n: number) => Math.round(n * 100) / 100;

const STEP = 12; // grid spacing in CSS px
const LEVELS = 18;
const FRAME_MS = 1000 / 30;

export function TerrainBackdrop() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const noise = makeNoise3(20260411);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let w = 0, h = 0, cols = 0, rows = 0;
    let field = new Float32Array(0);
    let raf = 0;
    let last = 0;
    let t = 7.3;
    let visible = true;
    const mouse = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4, s: 0, ts: 0 };

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / STEP) + 1;
      rows = Math.ceil(h / STEP) + 1;
      field = new Float32Array(cols * rows);
    };

    const draw = () => {
      const sc = 1 / 420; // terrain feature size
      const hillR2 = 2 * 170 * 170;
      for (let r = 0; r < rows; r++) {
        const y = r * STEP;
        for (let c = 0; c < cols; c++) {
          const x = c * STEP;
          let v =
            noise(x * sc, y * sc, t) * 0.62 +
            noise(x * sc * 2.3 + 40, y * sc * 2.3, t * 1.4) * 0.22;
          // gentle rise toward the sun (bottom right)
          v += ((x / w) * 0.25 + (y / h) * 0.2) - 0.2;
          if (mouse.s > 0.001) {
            const dx = x - mouse.x, dy = y - mouse.y;
            v += mouse.s * 0.55 * Math.exp(-(dx * dx + dy * dy) / hillR2);
          }
          field[r * cols + c] = v;
        }
      }

      ctx.clearRect(0, 0, w, h);
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, "rgba(83,101,73,0.55)"); // sage
      grad.addColorStop(0.55, "rgba(110,129,103,0.55)");
      grad.addColorStop(1, "rgba(176,83,47,0.75)"); // clay near the sun
      ctx.strokeStyle = grad;
      ctx.lineCap = "round";

      for (let l = 0; l < LEVELS; l++) {
        const iso = -0.95 + (l * 1.9) / (LEVELS - 1);
        const major = l % 4 === 0;
        ctx.lineWidth = major ? 1.25 : 0.7;
        ctx.globalAlpha = major ? 0.9 : 0.5;
        ctx.beginPath();
        for (let r = 0; r < rows - 1; r++) {
          for (let c = 0; c < cols - 1; c++) {
            const i = r * cols + c;
            const a = field[i], b = field[i + 1];
            const d = field[i + cols], e = field[i + cols + 1];
            const code =
              (a > iso ? 8 : 0) | (b > iso ? 4 : 0) |
              (e > iso ? 2 : 0) | (d > iso ? 1 : 0);
            if (code === 0 || code === 15) continue;
            const x = c * STEP, y = r * STEP;
            // edge crossing points (linear interpolation)
            const top = () => [x + STEP * ((iso - a) / (b - a)), y];
            const right = () => [x + STEP, y + STEP * ((iso - b) / (e - b))];
            const bottom = () => [x + STEP * ((iso - d) / (e - d)), y + STEP];
            const left = () => [x, y + STEP * ((iso - a) / (d - a))];
            const seg = (p: number[], q: number[]) => {
              ctx.moveTo(p[0], p[1]);
              ctx.lineTo(q[0], q[1]);
            };
            switch (code) {
              case 1: case 14: seg(left(), bottom()); break;
              case 2: case 13: seg(bottom(), right()); break;
              case 3: case 12: seg(left(), right()); break;
              case 4: case 11: seg(top(), right()); break;
              case 6: case 9: seg(top(), bottom()); break;
              case 7: case 8: seg(left(), top()); break;
              case 5: seg(left(), top()); seg(bottom(), right()); break;
              case 10: seg(top(), right()); seg(left(), bottom()); break;
            }
          }
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden) { last = now; return; }
      const dt = Math.min(now - last, 100);
      if (dt < FRAME_MS) return;
      last = now;
      t += dt * 0.000045;
      const k = 1 - Math.pow(0.001, dt / 1000); // frame-rate independent easing
      mouse.x += (mouse.tx - mouse.x) * k;
      mouse.y += (mouse.ty - mouse.y) * k;
      mouse.s += (mouse.ts - mouse.s) * k * 0.6;
      draw();
    };

    const start = () => {
      cancelAnimationFrame(raf);
      resize();
      draw();
      if (!reduce.matches) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    };

    const host = canvas.parentElement ?? canvas;
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.tx = e.clientX - r.left;
      mouse.ty = e.clientY - r.top;
      if (mouse.ts === 0) { mouse.x = mouse.tx; mouse.y = mouse.ty; }
      mouse.ts = 1;
    };
    const onLeave = () => { mouse.ts = 0; };
    const section = host.closest("section") ?? host;
    section.addEventListener("pointermove", onMove as EventListener, { passive: true });
    section.addEventListener("pointerleave", onLeave);

    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; });
    io.observe(canvas);
    const ro = new ResizeObserver(() => { resize(); draw(); });
    ro.observe(canvas);
    reduce.addEventListener("change", start);
    start();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      reduce.removeEventListener("change", start);
      section.removeEventListener("pointermove", onMove as EventListener);
      section.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  // 32 rays around the sun; alternating lengths, clipped above the horizon
  const rays = Array.from({ length: 32 }, (_, i) => {
    const a = (i / 32) * Math.PI * 2;
    const r0 = 128;
    const r1 = i % 2 === 0 ? 236 : 186;
    return (
      <line
        key={i}
        x1={round2(300 + Math.cos(a) * r0)}
        y1={round2(300 + Math.sin(a) * r0)}
        x2={round2(300 + Math.cos(a) * r1)}
        y2={round2(300 + Math.sin(a) * r1)}
      />
    );
  });

  return (
    <div className="terrain" aria-hidden="true">
      <div className="terrain__glow" />
      <canvas ref={canvasRef} className="terrain__map" />
      <svg className="terrain__sun" viewBox="0 0 600 300">
        <defs>
          <clipPath id="terrain-sky">
            <rect x="0" y="0" width="600" height="300" />
          </clipPath>
          <radialGradient id="terrain-disc" cx="50%" cy="100%" r="100%">
            <stop offset="0%" stopColor="#C9785A" />
            <stop offset="70%" stopColor="#B0532F" />
            <stop offset="100%" stopColor="#9A4527" />
          </radialGradient>
        </defs>
        <g clipPath="url(#terrain-sky)">
          <g className="terrain__rays" stroke="#28352B" strokeOpacity="0.72" strokeWidth="2.5" strokeLinecap="round">
            {rays}
          </g>
          <circle cx="300" cy="300" r="104" fill="url(#terrain-disc)" />
        </g>
      </svg>
      <div className="terrain__horizon" />
      <div className="terrain__grain" />
    </div>
  );
}
