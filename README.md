# Avani — marketing site + personal-CFO platform

One Next.js 14 App Router app:

- **Marketing site** at `/` — built on the Avani design system (CSS custom
  properties + plain named-export React components; no CSS-in-JS, no UI libraries).
- **Platform** underneath, behind auth — clients → invoices → send → paid,
  plus the CFO layer: bank/card transactions, tax-ready P&L, quarterly
  estimates, a compliance calendar, and event-driven automations that do the
  prep work and ask for one tap.

## Stack

Next.js 14 · TypeScript · Prisma 7 + Postgres · Clerk (auth) · Resend (email) ·
Twilio (SMS, break-glass tier only) · @react-pdf/renderer (PDFs) ·
react-hook-form + zod · recharts · Vitest (unit) · Playwright (e2e)

## Run it

```bash
# 1. Postgres (from the repo root; creates avani + avani_test databases)
docker compose up -d

# 2. App (repo root is the app)
npm install
cp .env.example .env       # then fill in values — see below
npx prisma migrate dev
npm run db:seed            # settings, S-corp category chart, compliance calendar
npm run dev                # http://localhost:3000
```

Tests: `npm test` (unit) · `npm run test:e2e` (Playwright; boots its own server
on :3100 against `avani_test` with auth bypassed and email/SMS/Mercury faked).

## Configuration (.env)

| Key | Notes |
|---|---|
| `DATABASE_URL` | Postgres connection string (Neon recommended in production) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | From the Clerk dashboard. **Set sign-up to restricted/invite-only.** |
| `ALLOWED_EMAILS` | Comma-separated allowlist — the single-tenant guard on top of Clerk. Only these accounts may use the platform. |
| `RESEND_API_KEY` / `EMAIL_FROM` | Resend key + verified sender. Without a verified domain, Resend only delivers to your own address. `EMAIL_MODE=fake` writes to `.fake-emails/` instead of sending. |
| `MERCURY_API_KEY` | Mercury → Settings → API tokens. Create a **read-only** token; it is used server-side only. `MERCURY_MODE=fake` reads fixtures. |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` / `OWNER_PHONE` | SMS for the urgent tier only (imminent tax deadline, seriously overdue invoice). `SMS_MODE=fake` writes to `.fake-sms/`. |
| `TICK_SECRET` / `CRON_SECRET` | Auth for `/api/events/tick`. Vercel cron sends `Authorization: Bearer $CRON_SECRET` automatically. |
| `HEALTHCHECK_PING_URL` | Optional healthchecks.io ping URL — the external dead-man's switch. |
| `AUTH_MODE` | `clerk` in real use. `test` bypasses auth entirely — e2e/CI only, never production. |

## How the platform thinks

**Events, not clicks.** Every state change writes a `DomainEvent` in the same
database transaction (outbox pattern — `src/lib/events/`). Handlers are plain
functions registered in `register.ts` (the only wiring point — the deliberate
seam for a future durable runner like Inngest, if multi-step delayed workflows
ever become necessary). A Vercel cron hits `/api/events/tick` every 15 minutes:
it sweeps unprocessed events (the retry path) and runs detectors that turn
dates crossing into events — invoices going overdue, payments missing at
due+3, tax quarters approaching, compliance windows opening, biweekly drafts
coming due.

**Notifications are tiered, and tight.** In-app gets everything (bell +
activity feed). Email is for action-ready items only — one ask, one deep link.
SMS is break-glass (money + imminent deadline). Client-facing automation
(overdue reminder emails) ships **off** — flip it in Settings → Automations.

**Money conventions.** All money is integer cents; tax rates are basis points;
`Transaction.amountCents` is signed from the business's perspective (+in /
−out; Amex CSVs flip their charges-positive convention at import). P&L revenue
comes exclusively from income-categorized transactions — invoices are
receivables tracking, and the P&L footnote reconciles the two views.

**Failure visibility.** The dashboard health card answers "is my machine
running?" (tick freshness, failed reaction runs, stuck events, sync + delivery
failures). `/activity?view=failures` lists every failure with a Retry button;
dead letters pin until handled; repeated failures raise one meta-alert per day.

## Amex import how-to

Amex → Statements & Activity → download CSV. Create a Credit Card account
(the "amounts are charges" toggle defaults on), then Accounts → Import CSV.
Re-importing the same file is a no-op (content-hash dedupe with same-day
ordinals). Mercury accounts sync via the API instead — "Sync Mercury" on
Accounts, plus the scheduled tick.

## Deploying (Vercel Pro + Neon)

1. Create a Neon Postgres, set `DATABASE_URL`.
2. Import the repo into Vercel with the repo root as the project root; set every env
   var from the table above (real Clerk/Resend/Twilio/Mercury keys, `AUTH_MODE=clerk`,
   `EMAIL_MODE=resend`, `SMS_MODE=twilio`, `MERCURY_MODE=live`, strong `CRON_SECRET`).
3. `vercel.json` already schedules the tick cron (`*/15 * * * *`). Optionally add a
   healthchecks.io check and set `HEALTHCHECK_PING_URL`.
4. Run `npx prisma migrate deploy && npm run db:seed` against the production DB once.
5. In Clerk: restricted sign-up; in Resend: verify your sending domain.

## Repo map

```
prisma/                  schema, migrations, seeds (S-corp categories, compliance calendar)
src/lib/                 pure logic (money, dates, csv, rules, matching, pnl, tax-estimates…)
src/lib/events/          catalog · emit (outbox) · dispatch (registry) · detectors · register
src/actions/             server actions (auth + zod + revalidate; the only mutation layer)
src/app/(marketing)/     public site
src/app/(platform)/      dashboard, invoices, clients, transactions, accounts, reports, activity, settings
src/components/form/     RHF-bound wrappers over the design system
src/ds/                  the Avani design system (tokens + components)
e2e/                     Playwright specs + fixtures (Amex CSV, Mercury JSON)
```

## Job finder (`/jobs`)

A private job search inside the platform: pulls postings from public job APIs,
filters and scores them against your criteria, shows benefits at a glance,
tracks applications, and tailors your résumé per posting. **It never applies
for you**: "Applied" is a status you set after applying yourself.

- **Criteria** live in one file: `src/lib/jobs/scoring-config.ts` (hard
  filters, weighted scoring, lanes, the verify-on-the-call checklist). Bump
  `SCORING_VERSION` after editing; the next refresh rescores everything.
- **Refresh**: the event tick refreshes two due boards per run (each board
  about daily). `npm run jobs:refresh` refreshes all boards now.
- **Duplicates are rejected**: the same job from another source, or reposted
  under a new id, becomes an alias of the existing posting. Deleted postings
  leave a tombstone so refreshes never bring them back; anything you applied
  to can only be archived.
- **Adding jobs yourself** (sites that block servers, like LinkedIn): Jobs →
  Add a job has a bookmarklet, the Android share target (install the app),
  an iOS Shortcut recipe, and paste.
- **Résumé**: import `master.json` at Jobs → Résumé (append-only; keep the
  file out of git, `/resume` is ignored). Tailoring selects and lightly
  rewords master content only; a code check blocks added numbers, em dashes,
  and headlines outside your approved list, and flags terms that aren't in
  master. Contact details never go to the AI (`src/lib/jobs/ai-payload.ts`).
  PDFs reproduce your résumé layout (`src/lib/jobs/resume-layout.ts`) in
  Carlito, which is metric-compatible with Calibri. Preview, then download.

### Adding a job source

Most additions are just a board: Jobs → Boards → Add a board (Greenhouse,
Lever, Ashby, SmartRecruiters, Workday, USAJOBS). To check a list of
companies first: `npm run jobs:verify-boards -- --apply` probes each one on
the documented public job APIs (and Workday `robots.txt`) and adds the ones
that answer. `npm run jobs:discover-contractors` lists MD/DC/VA IT
contractors from USAspending award data to grow the list.

A new kind of source is one plugin:

1. Write `src/lib/jobs/sources/<name>.ts` implementing `SourcePlugin`
   (`fetchBoard(board, ctx, { titleFilter })` → `NormalizedPosting[]`). Use
   `ctx.fetchJson` (polite in live mode, fixtures in `JOBS_SOURCE_MODE=fake`),
   throw on a failed fetch, and apply `titleFilter` before any detail fetch.
2. Register it in `src/lib/jobs/sources/index.ts`.
3. Add its name to the `JobSource` enum in `prisma/schema.prisma` and create a
   migration.
4. Add a test with a recorded-style response in
   `src/lib/jobs/sources/sources.test.ts`.

Only documented public job APIs, or sites whose `robots.txt` allows it.
Anything else goes through browser capture.
