# Rubric

The problem-calibration layer. Before any stack, architecture, or infra
decision, answer each **dial** below for the idea at hand. Every dial is set by
**forces in the problem**, not by taste, familiarity, or fashion — each dial
names its forces so the setting is arguable and auditable. The output is a
configured build: the [Charter](./CHARTER.md) then says how to execute at that
configuration, and the [Playbook](./PLAYBOOK.md) runs it phase by phase.

Two worked cases run through every dial: **Avani** (money / CFO ops: invoicing,
P&L, S-corp taxes; single owner; low volume) and the **invasive-species
non-profit** (volunteer events + field data capture, often with no signal).
They deliberately land on *different* settings — that difference is the proof
the Rubric calibrates instead of rubber-stamping one architecture.

Rules of use:

- Set **every** dial, even when the answer is "the default." An unset dial is
  an unexamined assumption (Charter P1).
- A dial setting must cite its force. "Offline-first because volunteers are in
  a forest" is a setting; "offline-first because PWAs are cool" is not.
- If the problem has a dimension no dial captures, that's not a shrug — it's a
  **new dial** (see the note at the bottom).

---

## Dial 1 — Correctness bar

**Question:** What must *never* be wrong here — and how hard do we prove it?

**Spectrum:** examples suffice → unit tests on key paths → **written
invariants proven with property / concurrency / golden tests** (Charter P3).

**Forces that raise it:** money moves or is reported to a government; records
feed a downstream authority (taxes, science, audits, legal); a silent wrong
answer costs more than a loud failure; concurrent writers exist.
**Forces that lower it:** data is advisory, human-reviewed, and cheaply
re-derivable.

| Case | Setting | Why |
|---|---|---|
| Avani | **Max.** Written money invariants → property + concurrency + golden tests. | Wrong cents compound into wrong P&L into wrong tax filings. Invariants: `total == subtotal + tax`; "paid at most once" (the `SENT→PAID` conditional flip in `src/actions/invoices.ts`); "a transfer contributes $0 to P&L". Proven over 5,000 randomized invoices and 25 parallel allocations. |
| Non-profit | **High — but aimed at provenance, not arithmetic.** | The scientific record is the product. Invariants: an observation is immutable once submitted (corrections supersede, never overwrite); every record carries validated GPS + capture timestamp; a queued offline observation syncs **exactly once** (client-generated UUID + unique constraint, same at-most-once shape as Avani's paid-flip). Money barely exists; nobody property-tests a donation thermometer. |

Same dial, different *target*: Avani proves sums; the non-profit proves
lineage. Both get invariants written down first — what changes is which
statements make the list.

## Dial 2 — Data sensitivity / compliance

**Question:** What's the most dangerous data we hold, and who says so?

**Spectrum:** internal-only, one user → PII of others → regulated data
(HIPAA/PCI/residency) → data that is dangerous merely by *location* (protected
info).

**Forces:** whose data it is (yours vs volunteers vs patients); a named
regulator or contract; whether disclosure harms a person, an organization, or —
new with the non-profit — an *ecosystem*. This dial sets auth model, access
control granularity, audit depth, and encryption/retention posture. Whatever
the level: enforce it at the data layer, not by convention (Charter P4 — the
`invoiceByShareToken` explicit-`select` pattern, not a habit).

| Case | Setting | Why |
|---|---|---|
| Avani | **Low-moderate.** Single-user auth, one client-facing share-token surface, normal financial care. | It's the owner's own books. No third-party PII beyond business contacts; no regulator beyond ordinary tax accuracy. Sensitive surface is the share link — handled with token + field-level `select`, revoked on void (`shareToken: null`). |
| Non-profit | **Moderate-high, two distinct kinds.** Volunteer PII (names, emails, event attendance) → real accounts, roles (volunteer / coordinator / admin), audit on edits. **Protected-species locations** → coordinates access-controlled and fuzzed in public views, exact points restricted by role. | Publishing a rare-plant location can get it poached. That's a sensitivity class Avani never had — location itself is the secret. |

## Dial 3 — Data shape & media

**Question:** Is the data plain relational rows, or does it have a shape
(geo, media, timeseries, documents) that needs first-class treatment?

**Spectrum:** relational rows only → rows + blobs → geo/timeseries needing
native query support → media pipelines (transcode, ML, tiling).

**Forces:** do queries need the special shape (radius search, map rendering),
or is it just stored? Volume of binary data; whether the DB or object storage
should own it. Default: stay on Postgres — geo means **PostGIS on Postgres**,
not a new database (Charter stack table); blobs go to **object storage behind
an S3-compatible API**, never in the DB.

| Case | Setting | Why |
|---|---|---|
| Avani | **Rows only.** Integer-cents columns, dates, text. No blobs, no geo. | Invoices and transactions are born relational (`prisma/schema.prisma` is 450 lines of plain models). PDF invoices are rendered, not stored. |
| Non-profit | **Geo + photos, first-class.** PostGIS point/polygon columns (removal sites, event boundaries, radius queries); before/after photos in S3-compatible object storage (R2/S3), DB stores keys + EXIF-derived metadata. | "Show removals within 500 m of this trailhead" is a core query, not a report. Photos are evidence — part of provenance (Dial 1), so their capture metadata is validated on ingest. |

*This dial did not exist when Avani was the only case — the non-profit forced
it. That's the Rubric growing correctly (see below).*

## Dial 4 — Interaction model

**Question:** Where is the user when they act, and what's between them and the
server?

**Spectrum:** **online CRUD** (server components + actions, request/response)
→ **offline-first** (PWA, local durable queue, background sync, conflict
policy) → **real-time / collaborative** (websockets, presence, CRDTs).

**Forces:** connectivity at the moment of capture; cost of a lost entry; more
than one person editing the same thing live. This is the dial with the biggest
architectural blast radius — it decides the entire client architecture, so it
must be set **before** foundation, not retrofitted. Never build the sync
machinery "just in case": offline-first is expensive (queue, idempotent sync
endpoint, conflict policy, stale-UI states) and only the field-capture force
justifies it.

| Case | Setting | Why |
|---|---|---|
| Avani | **Online CRUD.** Server Components + server actions, zero offline machinery. | The owner invoices from a desk with wifi. A failed request is a visible retry, not lost data. |
| Non-profit | **Offline-first capture** — the defining setting of this build. PWA; observations written to a local durable queue (IndexedDB) with client-generated UUIDs; background sync to an idempotent endpoint (unique on the UUID, so retries are no-ops — Dial 1's exactly-once); photos queued alongside. Admin/coordinator screens stay plain online CRUD — offline-first applies to the *capture path only*. | Volunteers log removals in a ravine with no bars. A lost observation is lost science and a demoralized volunteer. Conflicts are rare by construction: observations are append-only (Dial 5), so sync is merge-free insertion, not document merging. |

## Dial 5 — Consistency

**Question:** When two things happen at once, what must the database
guarantee?

**Spectrum:** strict transactional with atomic state transitions → transactional
core + async reactions (outbox) → mostly **append-only / eventual**.

**Forces:** contested state machines (two writers racing to flip the same
status) push strict; "failures must be caught" pushes outbox (Charter stack
table); records that are events-that-happened, never edited, push append-only —
which conveniently is also what offline sync (Dial 4) wants.

| Case | Setting | Why |
|---|---|---|
| Avani | **Strict transactional.** Conditional atomic writes for every status flip (`updateMany where status: "SENT"`); invoice-number allocation atomic inside the transaction; event-outbox (`emitEvent` writes the `DomainEvent` in the caller's transaction) so the log can never disagree with reality; handlers at-least-once + idempotent via `HandlerRun` unique `[eventId, handler]`. | Money state is contested: a manual mark-paid races an auto-match, and both succeeding means double receipts. |
| Non-profit | **Append-only core, eventual sync.** Observations are immutable events; corrections are superseding records pointing at the original (no silent edits — Dial 1). Sync is insert-if-absent. The few genuinely contested states (event capacity, coordinator approval of a record) get Avani-style conditional flips — strictness applied surgically, not globally. | The domain *is* a log: "we removed 40 kg of knotweed at 14:02 at this point." Nothing about that should ever be updated in place. |

## Dial 6 — Infra & scale

**Question:** What's the cheapest platform that serves this problem's *actual*
forces — and what specific force would move us off it?

**Default: PaaS** (Vercel / Railway / Fly + managed Postgres). The platform is
a **calibration output, not a default lifestyle**: hyperscaler + IaC (AWS/CDK,
Azure, GCP) is justified only by a named force, never by resume-driven
architecture. The forces that justify it:

1. **Services PaaS lacks** — heavy queues/streaming, ML training/inference at
   scale, big-data batch, serious geo-analytics, media pipelines
   (transcode/tiling) beyond a cron and a worker.
2. **Compliance / residency** — a regulator or contract that names where data
   lives (HIPAA BAA, FedRAMP, EU residency).
3. **Cost at real scale** — measured PaaS bills crossing what an
   IaC-managed setup + the engineering to run it costs. Real invoices, not
   projections.
4. **Existing cloud estate** — the org already lives on AWS; joining it is
   cheaper than bridging it.
5. **Custom infra/networking** — VPC peering, private links, GPUs, protocols
   PaaS won't terminate.
6. **Scale shape PaaS can't hit** — sustained high-throughput workers,
   long-lived connections at volume, multi-region active-active.

None of those forces present? PaaS, and stop thinking about it. But **defer
with seams** so the answer can change without a rewrite: 12-factor config, DB
reached only via connection string, storage behind an S3-compatible API, async
work behind a dispatcher seam (Avani's `dispatch.ts` is explicitly built so a
durable runner like Inngest swaps in without touching emit sites). Then
PaaS→AWS is a migration, not a rewrite.

| Case | Setting | Why |
|---|---|---|
| Avani | **PaaS: Vercel + managed Postgres.** No force present. | One user, low volume, no compliance regime, no special services. Anything more is cosplay. |
| Non-profit | **PaaS today: Vercel/Fly + managed Postgres w/ PostGIS + R2/S3 for photos.** All six forces answered "no" — managed Postgres does PostGIS, object storage does photos. **Named trigger to move:** a real imagery/geo-analytics pipeline (satellite/drone tiling, ML species-ID on photo streams, regional raster analysis) — that's force #1, and only then AWS + CDK, entered through the seams above. | A few thousand observations a season with phone photos is not big data. The trigger is written down now so the future decision is a lookup, not a debate. |

## Dial 7 — Ops depth

**Question:** Who bleeds when this breaks, and how fast must a human know?

**Spectrum:** solo-internal (backups + error tracking + a weekly glance) →
audience-facing (uptime monitoring + alerting to a human + tested restores +
dead-man's-switch on scheduled jobs) → revenue/life-critical (on-call, SLOs,
runbooks).

**Forces:** blast radius (one annoyed owner vs 80 stranded volunteers vs
paying customers); data irreplaceability; scheduled jobs whose *silent absence*
is the failure mode; whether anyone would notice an outage before the next
login. The floor is set by the Charter (backups + monitoring + alerting before
"done" — never zero); this dial sets the depth. The Avani run *under-did* this
dial — which is why the Playbook's operate phase is now a hard gate, not an
epilogue.

| Case | Setting | Why |
|---|---|---|
| Avani | **Solo-internal, but with the full floor:** automated tested-restore backups (the books are irreplaceable), error tracking, health surface for the event dispatcher, dead-man's-switch on the cron that runs payment/tax detectors — a detector that silently stops *is* the failure. Alerts to the owner; no on-call. | One user who is also the operator. But "I'd notice eventually" was the trap the first run fell into. |
| Non-profit | **Audience-facing:** uptime + alerting to a named human (event day + broken app = 80 volunteers with nothing to do), tested restores (observations are unrepeatable field data), sync-queue depth monitoring (an offline queue that never drains fails *silently* — the dead-man's-switch of this build), photo-upload failure tracking. Still no on-call rotation — a non-profit doesn't staff one; alerting + a rollback plan is the honest ceiling. | Blast radius is other people's Saturday and irreplaceable science. |

---

## Worked comparison — the punchline

Same Charter, same Playbook, same default stack. Different problem →
different configuration on **every dial**:

| Dial | **Avani** (CFO ops) | **Non-profit** (field capture) |
|---|---|---|
| 1 · Correctness bar | Max — money invariants; property/concurrency/golden tests | High — provenance invariants; immutability, GPS/time integrity, exactly-once sync |
| 2 · Sensitivity | Low-mod — own books; token-guarded share surface | Mod-high — volunteer PII + protected-species locations (roles, fuzzing, audit) |
| 3 · Data shape | Rows only | PostGIS geo + photos in object storage |
| 4 · Interaction | Online CRUD | **Offline-first capture** (PWA + local queue + idempotent sync) |
| 5 · Consistency | Strict txn; conditional atomic flips; outbox | Append-only observations; supersede-not-edit; surgical strictness |
| 6 · Infra | PaaS (Vercel + Postgres); no trigger in sight | PaaS today; named AWS trigger = real imagery/geo-analytics pipeline |
| 7 · Ops depth | Solo-internal + full floor (tested restores, dead-man's-switch) | Audience-facing (uptime alerts to a human, sync-queue monitoring) |

If two ideas produce identical columns, either they're genuinely the same kind
of problem — or the dials weren't actually turned.

---

## This document is living

Versioned with the method (see [README](./README.md)). The growth rule: **a
new *kind* of problem adds a dial.** Dial 3 (data shape & media) exists because
the non-profit case had a dimension — geo + evidence photos — that no
Avani-derived dial captured. When a future problem stresses something these
seven don't name (multi-tenancy, real-time collaboration, a marketplace's
two-sided trust), that's a new dial, recorded here with its forces and its
first two calibration settings.

## Changelog

- **v0.1** — Initial dials from Avani; second calibration case =
  invasive-species non-profit (added Dial 3, data shape & media, which Avani
  alone never surfaced).
