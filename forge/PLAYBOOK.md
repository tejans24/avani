# Playbook

The phased runbook. The [Rubric](./RUBRIC.md) configured the build; the
[Charter](./CHARTER.md) standardized how we execute; the Playbook is the order
of operations. Five phases, each with an **exit gate**. Nothing advances until
its gate is green — "mostly done, we'll circle back" is how phase-5 work
(backups, alerting) dies quietly, which is exactly what the Avani run proved.

These phases are written to be executable: a human runs them today (L0); a
`/bootstrap` Claude Code skill runs them phase-by-phase at L1 (see README
maturity ladder). Every gate is phrased as a checkable condition, not a vibe,
for that reason.

---

## Phase 1 — Scope & calibrate

Run the Rubric before touching a keyboard.

1. **One-paragraph problem statement.** Who acts, where they are when they act,
   what must never be wrong, who bleeds when it breaks. If it doesn't fit in a
   paragraph, the idea isn't scoped — split it.
2. **Set every dial** (Rubric dials 1–7), each with its force named. Unset
   dials are unexamined assumptions (Charter P1).
3. **Build-vs-buy list** (Charter P2). Enumerate what we **rent** (auth,
   email, payments, object storage, the PaaS, the AI coder) vs what we
   **build** (the differentiated brain only) — and for every rented thing,
   name its **seam**: the adapter boundary that makes swapping it an isolated
   change.

> *Avani's list: rent Vercel, managed Postgres, Resend-class email; build the
> invoicing/P&L/tax brain. Seam example: `dispatch.ts` is written so a durable
> runner (Inngest) replaces the dispatcher without touching emit sites,
> catalog, or handlers. Non-profit's list adds: rent object storage behind an
> S3-compatible API (R2 today, S3 if the AWS trigger fires), rent maps/tiles;
> build the observation-provenance and sync brain.*

**Exit gate:** problem statement written; all dials set with forces; rent/build
list complete with a named seam per rented dependency.

## Phase 2 — Foundation

Scaffold the skeleton — and wire the CI gate **first**, before any feature
code exists to be tempted by.

- Repo, TypeScript strict, the Charter's default stack (Next.js App Router,
  Prisma + Postgres, Zod, react-hook-form) — or the dial-justified deviations
  from phase 1 (e.g. non-profit: PostGIS migration, PWA/service-worker shell,
  object-storage adapter).
- DB schema v0 + migrations running from commit one. The data-layer guarantees
  the dials demand go in **now**: unique constraints, append-only shapes,
  status enums (Charter P4). They're cheap in an empty schema and expensive
  after data exists.
- Auth at the dial-2 depth (Avani: single-user; non-profit: roles from day
  one — retrofitting roles is a rewrite of every query's `where`).
- The shared Zod-schema + `FormXxx` layer (Charter conventions) — the first
  form pays for the library; every later form is composition.
- **CI gate wired first:** typecheck + unit + build + e2e on every push,
  required. Preview envs per branch.

**Exit gate:** CI green on an **empty-but-real app deployed to a preview
env** — real DB, real auth, one real page, full pipeline. Not a hello-world
that skips the hard wiring; a walking skeleton with nothing in it.

## Phase 3 — Build in milestones

The loop, per milestone (Charter P5): **build → typecheck → targeted test →
commit**, every commit green. A feature is ~5–7 milestones, not one heroic
diff.

- **Invariants first for correctness-critical parts** (Charter P3, dial 1).
  Write the invariant as a sentence, then the property/concurrency/golden test
  that proves it, then the code. *Avani: "paid at most once" was a written
  sentence before `markInvoicePaid` used a conditional `updateMany where
  status: "SENT"`. Non-profit equivalent: "an observation syncs exactly once"
  → unique constraint on the client UUID + a concurrency test replaying the
  same queue twice.*
- **Guarantees at the data layer as you go** (Charter P4) — the conditional
  flip, the explicit `select`, the unique constraint. Never "we'll harden it
  later."
- Milestone order follows risk: the dial-1 core first (money math / sync
  engine), CRUD scaffolding after. The scary part gets the most green commits
  under it.

**Exit gate (per milestone):** typecheck + targeted tests green, committed,
reviewed (human or agent-cross-check). No milestone merges red; no milestone
merges unreviewed.

## Phase 4 — Ship

- **Full gate:** unit + build + **all** e2e against a real DB. Targeted tests
  got you through milestones; the full suite is the price of production.
- **Craft/taste gate** (Charter P6): does it clear the bar for *its* audience?
  Avani cleared "the owner is proud to invoice clients from it"; the
  non-profit must clear "a cold, wet volunteer can log a removal one-handed in
  the rain." Works-but-ugly fails the gate.
- **Promotion, same artifact:** dev/preview → staging → prod. The thing you
  smoke-tested is the thing you ship — no "rebuild for prod."
- Deploy, then **smoke-test in prod**: the real login, the real critical path
  (send an invoice / queue-and-sync an observation), the real email actually
  arriving.

**Exit gate:** full suite green + craft gate passed + deployed + prod
smoke-test done by a human.

## Phase 5 — Operate + retro

**The phase the Avani run under-did — now first-class and gated.** Avani
shipped correct code (invariants proven, suite green) and still wasn't a
system the business could run on: tested restores, alerting, deliverability
checks all lagged the ship. Charter P7 names the lesson: *tested ≠
production-ready*. This phase closes that gap on purpose, every time.

### Production-readiness checklist (the operate gate)

Depth per Rubric dial 7 — but every box exists on every project:

- [ ] **Backups — automated AND restore-tested.** #1, always. An untested
      backup is a hope with a cron job. Actually restore into a scratch DB and
      diff row counts. (Avani: the books are unrecoverable by any other means.
      Non-profit: field observations cannot be re-collected.)
- [ ] **Error tracking** wired (Sentry-class), sourcemaps uploaded, and an
      error actually thrown + seen end-to-end once.
- [ ] **Uptime/health monitoring + alerting to a named human.** A dashboard
      nobody is paged from is decoration. (Non-profit: alert before Saturday's
      event, not after.)
- [ ] **Dead-man's-switch on every scheduled job.** Alert on *absence* of the
      heartbeat, not presence of an error — a cron that silently stops throws
      nothing. (Avani: the payment/tax detectors; non-profit: the sync-queue
      drain and its depth metric.)
- [ ] **Secrets management:** no secrets in the repo, per-env values, rotation
      is a documented five-minute task, not archaeology.
- [ ] **Email deliverability verified:** SPF/DKIM/DMARC set and a real message
      landed in a real inbox. *Sent ≠ delivered* — Avani learned this on
      invoice emails.
- [ ] **Rollback plan written and rehearsed once:** the exact command to
      re-deploy the previous artifact, and what to do about migrations that
      ran.
- [ ] **Honest status doc:** three lists — **proven** (invariants with tests),
      **assumed** (believed, untested), **deferred** (known gaps, named, with
      the trigger that un-defers them). No prose that blurs the three.

### Method retro (Charter P8)

Last act of every project: write **1–3 deltas** back into the Charter or
Rubric. What did this problem teach; which default was wrong; which pattern
gets deposited (a new `FormXxx` component, a new detector, a new dial)? A
project that deposits nothing back was consumed, not compounded — the
calibration library *is* the moat (README).

> *The Avani retro produced this phase's promotion: operate was an epilogue,
> it's now a gate. The non-profit retro is expected to deposit at least: the
> offline-queue/sync pattern as a reusable asset, and a verdict on whether
> Rubric dial 3 (data shape) earned its place.*

**Exit gate:** every checklist box checked at the dial-7 depth + honest status
doc written + retro deltas recorded in the artifacts' changelogs.

---

## Changelog

- **v0.1** — Initial phases; operate/production-ready gate elevated to
  first-class after the Avani run under-did it.
