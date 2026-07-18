# Avani — marketing site + invoicing platform

One Next.js 14 App Router app:

- **Marketing site** at `/` — built on the Avani design system (CSS custom
  properties + plain named-export React components; no CSS-in-JS, no UI libraries).
- **Invoicing platform** underneath, behind auth — add clients, create
  Mercury-style invoices, email them as PDFs, track Draft → Sent → Paid.

## Stack

Next.js 14 · TypeScript · Prisma 7 + Postgres · Clerk (auth) · Resend (email) ·
@react-pdf/renderer (invoice PDFs) · react-hook-form + zod · recharts (reports) ·
Vitest (unit) · Playwright (e2e)

## Run it

```bash
# 1. Postgres (from the repo root; creates avani + avani_test databases)
docker compose up -d

# 2. App
# repo root is the app
npm install
cp .env.example .env       # then fill in values — see below
npx prisma migrate dev
npm run db:seed            # settings singleton + a sample client
npm run dev                # http://localhost:3000
```

### Environment variables (`.env`)

| Variable | Notes |
|---|---|
| `DATABASE_URL` | `postgresql://avani:avani@localhost:5432/avani` for local Docker |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | From your [Clerk dashboard](https://dashboard.clerk.com). Set the Clerk app to **restricted/invite-only sign-up**. |
| `ALLOWED_EMAILS` | Comma-separated allowlist. Signing in with Clerk is not enough — the account email must be listed here (single-tenant guard). |
| `RESEND_API_KEY` / `EMAIL_FROM` | From [Resend](https://resend.com). Without a verified domain, Resend only delivers to your own account email. |
| `EMAIL_MODE` | `resend` for real delivery; `fake` writes emails to `.fake-emails/` (used by tests and key-less local dev) |
| `AUTH_MODE` | `clerk` normally; `test` bypasses Clerk entirely — **never in production** (used by e2e/CI) |

## The platform

| Route | What it does |
|---|---|
| `/dashboard` | Outstanding / overdue / collected tiles + recent invoices |
| `/invoices` | Full list with status filter tabs (computed Overdue included) |
| `/invoices/new` | Invoice form: line items (Description · Hours · Rate · Amount), live totals, tax in basis points |
| `/invoices/[id]` | PDF preview, Send (Resend w/ PDF attached), Mark paid, Void, Duplicate (+ next period), Delete draft |
| `/clients` | Client companies: contact, billing email + CC list, address |
| `/reports` | Revenue by month, outstanding vs collected, top clients |
| `/settings` | Your company info (invoice From block), payment instructions, defaults, next invoice number |

Domain rules worth knowing:

- **Money is integer cents**; tax rates are basis points (875 = 8.75%). Totals are
  always recomputed server-side.
- **Invoice numbers** (`INV-0001`) are allocated atomically inside the creation
  transaction; sent invoices are never edited — duplicate or void instead.
- **First send freezes** the company snapshot (`fromSnapshot`) so later settings
  edits never rewrite sent history.
- **"Duplicate for next period"** shifts issue/due dates and any `MM/DD/YY`
  ranges inside line-item descriptions forward 14 days — one-click biweekly billing.
- **OVERDUE is computed at read time** (`SENT` past due), never stored.

## Tests

```bash
npm run test        # Vitest unit tests (money, dates, status, validation)
npm run test:e2e    # Playwright, boots the app on :3100 against avani_test
```

The e2e suite runs with `AUTH_MODE=test` and `EMAIL_MODE=fake` — no Clerk or
Resend keys needed. CI (`.github/workflows/ci.yml`) runs lint → unit → build → e2e
on every push. If your sandbox has a system Chromium instead of downloaded
Playwright browsers, run with `PW_CHROMIUM_PATH=/path/to/chromium`.

## Deploying

Suggested: **Vercel + Neon**.

1. Create a Neon Postgres, set `DATABASE_URL` (pooled connection string).
2. `npx prisma migrate deploy` against it, then seed.
3. Import the repo into Vercel with the repo root as the project root; set every env
   var from the table above (`AUTH_MODE=clerk`, `EMAIL_MODE=resend`).
4. Clerk: add your production domain; Resend: verify your sending domain.

## Design system

`src/ds/` is the Avani design system, used by both halves of the app —
tokens (`ds/tokens/*.css`: bone/forest/clay palette, Newsreader + Hanken Grotesk +
Spline Sans Mono) and components (`ds/components/core`, `ds/components/forms`).
Global CSS loads once in `app/layout.tsx`. Platform-side conventions:

- Forms: react-hook-form + zodResolver via the RHF-bound wrappers in
  `src/components/form/` (never hand-roll `Controller`); schemas in
  `src/lib/validations.ts` are shared by forms and server actions.
- Mutations: server actions in `src/actions/` (all `requireAuth()`-guarded).
- The invoice PDF (`src/pdf/`) and email template hardcode the brand hex values
  since react-pdf/email HTML can't read CSS custom properties.
