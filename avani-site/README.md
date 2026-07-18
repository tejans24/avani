# Avani — Next.js marketing site

The Avani marketing site, built on the Avani design system as a **Next.js 14 App
Router** project. Plain named-export React components + CSS custom properties — no
CSS-in-JS, no UI libraries.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
```

`npm run build && npm run start` for a production build.

## Structure

```
avani-site/
├─ package.json, tsconfig.json, next.config.mjs
├─ public/brand/            rising-sun marks (favicon + logo lockups)
└─ src/
   ├─ app/
   │  ├─ layout.tsx         imports the design system once + site.css; metadata/favicon
   │  ├─ page.tsx           composes the eight sections
   │  └─ site.css           page layout helpers (container, section rhythm, grids)
   ├─ ds/                   the design system, dropped in verbatim
   │  ├─ styles.css         @import manifest (tokens + Google-Fonts faces)
   │  ├─ tokens/*.css        colors, typography, spacing, effects, base, fonts
   │  └─ components/
   │     ├─ core/           Button, IconButton, Badge, Card, Eyebrow, Divider,
   │     │                  Avatar, Stat, Callout
   │     └─ forms/          Field, Input (+ Textarea), Select, Checkbox (+ Radio), Switch
   └─ components/site/      Header, Hero, Services, Process, About, Proof, Contact, Footer
```

## How it's wired

- **Global CSS** loads once in `app/layout.tsx` via `import "@/ds/styles.css"`. That
  file `@import`s the tokens and the webfonts (Newsreader, Hanken Grotesk, Spline Sans
  Mono); webpack resolves the relative token paths. Everything else reads CSS custom
  properties — you rarely hardcode a value.
- **Components are named exports** imported with the `@/` alias, e.g.
  `import { Button } from "@/ds/components/core/Button"`.
- **`"use client"`** is set on the interactive components (Button, IconButton, Card,
  Switch, Input/Textarea, Select, Checkbox/Radio) and the two stateful sections
  (Header, Contact). Everything else renders on the server.
- **Assets** live in `public/brand/` and are referenced as `/brand/mark-sun.svg`.

## What's a placeholder

Per the brand brief: the **About** team photo is a gradient placeholder, and the
**Proof** figures + testimonial are sample data — swap in real case studies, quotes,
and (for public-sector work) government registrations. Contact form `onSubmit` shows a
success state with no backend; wire your own handler / API route.

## Notes

- TypeScript with `allowJs` — design-system components are `.jsx` and import cleanly
  into the `.tsx` pages. Rename them to `.tsx` and add prop types if you prefer.
- Fonts load via a Google-Fonts `@import` in `ds/tokens/fonts.css`. Move to `next/font`
  or self-hosted licensed files later if desired — only the `--font-display/-sans/-mono`
  tokens reference them.
- Targets WCAG 2.1 AA (contrast, visible focus, reduced-motion, real semantics). Re-run
  a contrast check whenever you add a new text/background pairing.
