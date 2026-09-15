import React from "react";

/**
 * HeroScene — a great blue heron standing in shallow water, drawn as flat
 * vector layers in the brand palette (forest silhouette, sage water, a pale
 * far bank). Purely decorative: hidden from assistive tech.
 *
 * Motion is minimal and opt-in (see `.hero-scene*` in site.css): the scene
 * settles in once on load and the water lines drift very slowly. Under
 * prefers-reduced-motion everything is static and fully visible.
 *
 * The heron path is a placeholder silhouette — swap `HERON_PATH` for a
 * licensed/commissioned vector when one is available; the layout, water and
 * motion are asset-independent.
 */

const HERON_PATH =
  "M 36 140 L 118 122 C 128 110, 150 108, 164 117 L 206 111 L 208 116 L 176 131 " +
  "C 196 150, 214 180, 214 215 C 214 240, 200 255, 206 266 C 230 270, 300 272, 350 300 " +
  "C 380 318, 405 330, 420 342 L 430 352 L 402 354 C 360 352, 320 346, 285 336 " +
  "C 240 326, 188 300, 172 268 C 160 244, 176 224, 180 205 C 184 182, 172 160, 158 146 " +
  "L 118 140 Z";

export function HeroScene() {
  return (
    <svg
      className="hero-scene"
      viewBox="0 0 520 560"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="hero-mist" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--sage-tint)" stopOpacity="0" />
          <stop offset="1" stopColor="var(--sage-tint)" stopOpacity="1" />
        </linearGradient>
      </defs>

      {/* far bank: a low treeline behind a band of mist */}
      <g className="hero-scene__bank">
        <path
          fill="var(--sage-tint)"
          d="M0 404 C 60 396, 90 388, 140 396 C 190 386, 250 386, 300 396 C 350 388, 400 386, 450 396 C 480 392, 505 394, 520 400 L 520 438 L 0 438 Z"
        />
        <rect x="0" y="370" width="520" height="68" fill="url(#hero-mist)" />
      </g>

      {/* reeds at the water's edge */}
      <g
        className="hero-scene__reeds"
        stroke="var(--sage-soft)"
        strokeLinecap="round"
        fill="none"
      >
        <path strokeWidth="1.4" d="M 412 438 C 414 412, 418 386, 424 366" />
        <path strokeWidth="2" d="M 430 438 C 432 400, 436 360, 446 322" />
        <path strokeWidth="1.6" d="M 452 438 C 452 405, 456 372, 466 344" />
        <path strokeWidth="2.2" d="M 470 438 C 470 398, 474 356, 486 310" />
        <path strokeWidth="1.6" d="M 492 438 C 490 408, 494 380, 500 352" />
        <path strokeWidth="5" d="M 446 322 L 444 336" />
        <path strokeWidth="5" d="M 486 310 L 484 326" />
      </g>

      {/* waterline */}
      <rect x="0" y="437" width="520" height="3.5" fill="var(--sage-line)" />

      {/* leg reflection */}
      <g
        stroke="var(--sage-soft)"
        strokeWidth="4.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.35"
      >
        <path d="M 272 442 L 284 492" />
        <path d="M 308 442 L 318 492" />
      </g>

      {/* heron */}
      <g className="hero-scene__heron">
        <path fill="var(--forest)" d={HERON_PATH} />
        <g
          stroke="var(--forest)"
          strokeWidth="4.5"
          strokeLinecap="round"
          fill="none"
        >
          <path d="M 278 334 L 284 390 L 272 442" />
          <path d="M 306 338 L 318 392 L 308 442" />
        </g>
        <circle cx="140" cy="126" r="2.6" fill="var(--bone)" />
      </g>

      {/* slow current */}
      <g
        className="hero-scene__water"
        stroke="var(--sage-soft)"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.6"
      >
        <line
          className="hero-scene__ripple"
          x1="40"
          y1="458"
          x2="250"
          y2="458"
        />
        <line
          className="hero-scene__ripple"
          x1="150"
          y1="476"
          x2="440"
          y2="476"
        />
        <line
          className="hero-scene__ripple"
          x1="10"
          y1="500"
          x2="180"
          y2="500"
        />
        <line
          className="hero-scene__ripple"
          x1="290"
          y1="516"
          x2="500"
          y2="516"
        />
      </g>
    </svg>
  );
}
