# Charter

The non-negotiables. How we build, on every project, regardless of the idea.
Stack-specific conventions live at the bottom, keyed by stack branch.

Read this *with* [`RUBRIC.md`](./RUBRIC.md): the Rubric sets the dials for the
problem; the Charter says how we execute once they're set. Where the Charter
gives a **default**, it also gives the **forcing function** — the one question
you must answer to keep or deviate. Defaults you don't have to justify become
dogma.

---

## Principles (idea-agnostic)

### P1 — Calibrate before choosing
Classify the problem *before* picking stack, architecture, or infra. The problem
type sets the rigor. Money → correctness-first. "Failures must be caught" →
event-outbox + health surface. Solo/low-volume → single-tenant, no premature
scale. Never reach for a tool because it's familiar or fashionable; reach for it
because a *force* in the problem demands it (see Rubric).
> *Avani: money + taxes → integer cents, written invariants, property tests; one
> owner → single-tenant, Vercel, no multi-region.*

### P2 — Reuse-first; build-vs-buy honestly; leave seams
Adopt existing patterns, libraries, and components before writing new ones.
**Rent commodity and rails** (auth, payments, email, the AI coder, the PaaS,
best-in-class SaaS); **build only the differentiated brain.** The axis is not
free-vs-paid — it's *commodity vs differentiator* and *your time is the scarce
resource*. Whatever you rent, integrate behind a **clean adapter seam** so
adopting or swapping it later is an isolated change, not a rewrite.
> *Avani: kept our own invoicing (owned, free, integrated) but designed a seam to
> adopt Mercury's reconciliation later; never rebuilt ACH/receipts.*

### P3 — Invariants → tests (test the guarantee, not the example)
For anything that must never be wrong, **write the invariant down**, then test
the *invariant* — with property-based, concurrency, and golden tests — not a
single happy-path example. A guarantee without a test is a hope.
> *Avani money invariants: `total == subtotal + tax`; "paid at most once"; "a
> transfer contributes $0 to P&L" — proven over 5,000 randomized invoices, 25
> parallel allocations, and an end-to-end P&L assertion.*

### P4 — Guarantees at the data layer, not by convention
Enforce the important properties where they can't be bypassed — the schema, the
query, the transaction — not in a comment or a code-review habit.
- Privacy → explicit `select` of exactly the safe fields (never `include` the whole row).
- Money/history → append-only; state transitions via **conditional atomic writes** (`updateMany where status=X`), so races can't double-apply.
- Destructive ops → guarded and reversible; **archive ≠ delete**; block hard-delete of records referenced elsewhere.
> *Avani: `invoiceByShareToken` selects only client-safe fields; SENT→PAID is a
> conditional flip so a manual mark racing an auto-match pays once.*

### P5 — Small green increments; full gate before ship
Work in milestones. Each milestone: **build → typecheck → targeted test →
commit**, and every commit is green. Ship only behind the **full gate**: unit +
build + end-to-end, all passing. No "looks done."
> *Avani shipped as ~5–7 milestones per feature, each its own green commit;
> nothing pushed without the whole suite green.*

### P6 — Craft is a gate, not a garnish
"Works" is not the bar; **desirable** is. A build that passes every test and
looks like a raw spreadsheet fails. A design-system baseline and a taste check
("would I be proud to demo this to the user it's for?") are enforced as
seriously as the test gate. Calibrate the *depth* of polish to the audience
(internal tool vs client-facing), never skip it entirely.

### P7 — Tested ≠ production-ready; be honest about gaps
"Verified" means the invariants you tested hold — not that the system is
bug-free or production-proven. Name the operational truth out loud: backups,
deliverability, monitoring, real-world mileage. Distinguish *the code is correct*
from *I can run my business on it*. The gap between them is usually operational,
not algorithmic (see PLAYBOOK's operate phase).

### P8 — The method is living
Every project ends with a retro that writes deltas back into these artifacts
(PLAYBOOK phase 5). A default that was wrong gets changed; a new problem-type
adds a Rubric dial; a reusable pattern gets deposited. Version it, changelog it,
argue with it.

---

## Default stack (hard-pinned + forcing function)

These are the defaults for a typical web product. The Rubric can override any of
them — but only by answering the forcing question. Keeping a default silently is
not allowed; keeping it *deliberately* is.

| Concern | Default | Deviate when (forcing question) |
|---|---|---|
| App framework | **Next.js (App Router), TypeScript** | Is this not a web app, or does it need a runtime Next can't serve (native mobile, heavy realtime, edge-only)? |
| Data | **Postgres** (managed) via **Prisma** | Does the shape truly fit a different store (graph, timeseries, blob-first, geo-heavy → PostGIS still on Postgres)? |
| Hosting | **PaaS: Vercel / Railway / Fly** | Is there a *force* off PaaS? (compliance/residency, services PaaS lacks, cost-at-scale, existing cloud estate, custom infra) → then hyperscaler + IaC. See Rubric "Infra & scale". |
| Validation | **Zod**, one schema shared client+server | (rarely) — non-TS runtime. |
| Forms | **react-hook-form + `zodResolver`** + shared `FormXxx` library | (rarely) — not a form-heavy UI. |
| Client state | **local first; Zustand only for cross-cutting client UI** | See Conventions "State". |
| Tests | **Vitest** (pure logic) + **Playwright** (e2e against a real DB) | — |
| Async/reactions | **Event-outbox in-transaction** *when failures must be caught*; plain calls otherwise | Does anything need at-least-once delivery, retry, or an audit trail? Yes → outbox. No → don't over-build. |
| CI gate | **required**: typecheck + unit + build + e2e on every push | never skip. |
| Ops | **backups + monitoring + alerting required before "done"** | never skip (depth calibrated by Rubric "Ops depth"). |

---

## Conventions — React / Next branch

The streamlined patterns. The point of writing these down (including the sharp
edges) is that every build after the first is *fast* — nobody re-litigates the
choice or re-discovers the gotcha.

### Validation — one schema, both sides
- **One Zod schema per entity**, in a shared module (`src/lib/validations.ts`).
- The **same schema** validates on the client (RHF resolver) *and* on the server
  (the action's `safeParse`). Validate once, at the boundary; never duplicate
  rules across client and server.
> *Avani: `clientSchema`, `invoiceSchema`, etc. are imported by both the form and
> the server action.*

### Forms — compose, don't plumb
- **react-hook-form + `zodResolver`**, with a **shared `FormXxx` component
  library** (`FormTextInput`, `FormSelect`, `FormMoneyInput`, `FormDateInput`, …)
  wrapping the design-system primitives. A new form is composition.
- **Codified gotchas** (the reason this is streamlined):
  - A Zod field with `.default()` widens the schema's *input* type, diverging
    from the form's output type → **pin the resolver**: `zodResolver(schema) as Resolver<T>`.
  - Fields needing custom wiring — a real "none" option, money-as-cents,
    `null ↔ ""` mapping, a ds `Switch` — use **`useController`** with an explicit
    value map rather than fighting the default binding.
  - Server refreshes should propagate into an open form via `values:` (not
    `defaultValues:`).

### State — server → local → Zustand (last)
The library choice is easy; the discipline is the value. Default order:
1. **Server state is not client state.** Data owned by the DB/API lives in
   Server Components / the data layer (or React Query/SWR if client-fetched).
   **Never** put server data in a client store — that buys cache-coherence bugs
   for free.
2. **Local UI state → `useState`/`useReducer`.** Most state is local. Prefer it.
3. **Cross-cutting, ephemeral, client-only UI state** (wizard progress, command
   palette, cross-table selection, theme, optimistic toggles) → **Zustand**, in
   small sliced stores — never one god-store.

One-line test: *Owned by the server? → not a store. Used by one subtree? →
local. Genuinely cross-cutting client UI? → Zustand.*

### Server actions
- Thin, typed, guarded: `requireAuth()` → `schema.safeParse` → do work in a
  `$transaction` → `revalidatePath`. Return a discriminated `ActionResult`
  (`{ok:true}` | `{ok:false, error}`); narrow with `=== false` under
  `strict:false`.
- State transitions that must be exactly-once use **conditional atomic writes**
  (P4), not check-then-update.

### Money, dates, IDs (domain conventions, when present)
- Money = **integer cents**; format at the edge; never float-store.
- Dates that are calendar-only = **UTC date-only** helpers; never let timezone
  shift a day.
- Human-facing sequential IDs (invoice numbers, case numbers) = **atomic
  allocation + unique constraint**; never compute in app code without the DB
  guaranteeing uniqueness.

---

## Definition of Done (the gate)

A feature is done when **all** hold (depth per Rubric):
- [ ] Invariants for anything correctness-critical are written and tested (P3).
- [ ] Important guarantees enforced at the data layer (P4).
- [ ] Typecheck + unit + build + e2e green (P5).
- [ ] Craft/taste gate passed for its audience (P6).
- [ ] Operable: backups, monitoring, alerting, and the production-ready
      checklist satisfied (P7 / PLAYBOOK operate phase).
- [ ] Honest status written: what's proven, what's assumed, what's deferred.

## Changelog
- **v0.1** — Initial capture from the Avani build.
