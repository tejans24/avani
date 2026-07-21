# Forge

**A repeatable method for building production-ready software fast — the way we build.**

Forge is not a framework or a tool. It's the encoded *judgment* for turning an
idea into a well-architected, good-looking, deployable, operable product —
using human engineers + AI coding agents (Claude Code, Codex, …) as the
executors, with rigor **calibrated to the problem**.

The value here is not the AI and not the code. Those are commodity and rented.
The value is the cross-domain judgment: what to build vs buy, where the
guarantees live, how much infrastructure a problem actually warrants, and what
"done" really means. Forge externalizes that judgment so it's replayable across
people and AI runs — without every person (or every run) having to be
expert-of-all in the moment.

> **This is proprietary.** It's a specific person's taste written down, not
> generic best practice. Generic is what you get when you *don't* capture it.

## The three artifacts

| File | What it is | Changes… |
|------|------------|----------|
| [`CHARTER.md`](./CHARTER.md) | The idea-agnostic non-negotiables + stack conventions. How we build, always. | Rarely — only when a principle is proven wrong. |
| [`RUBRIC.md`](./RUBRIC.md) | Problem-calibration dials. Classify the idea → the dials configure the build. | Grows a new dial when a new *kind* of problem appears. |
| [`PLAYBOOK.md`](./PLAYBOOK.md) | The phased runbook: scope → build → ship → **operate**, with the production-ready gate. | When a phase or gate proves incomplete. |

**Flow:** `Idea → RUBRIC (set the dials) → CHARTER (apply the standards) → PLAYBOOK (run the phases) → product.`

## Two rules that make this work (not a wrapper)

1. **Orchestrate, don't rebuild.** The AI coders, the PaaS, the payment rails,
   the CRM — all rented and integrated behind clean seams. Forge builds only the
   differentiated layer: the standards, the calibration, the gates, the
   orchestration. Wrapping a coding agent thinly is worthless; the opinionated,
   production-ready layer around it is the whole point.
2. **It's living, or it's dead.** A frozen method rots into cargo-cult. Every
   project ends with a **retro** that writes 1–3 deltas back into the Charter or
   Rubric (what this problem taught us, which default was wrong). See
   *Evolution* below.

## Evolution (how the method improves)

- **Versioned like software.** This is `v0.1`. Bump it in commits; keep a short
  changelog at the bottom of each artifact.
- **Retro ritual.** The last step of every project (PLAYBOOK phase 5) is a
  method retro. Record deltas here and fold them into the artifacts.
- **Accumulate, don't just standardize.** The durable moat is the growing
  *calibration library* — every solved problem-type becomes a reusable
  dial-setting and a reusable pattern — not the checklist itself. Design each
  project to *deposit* reusable assets (a new FormXxx component, a new detector,
  a new rubric row), not just to consume the method.

## Calibration cases so far

- **Avani** — money / CFO ops, single owner. Correctness-first (invariants →
  tests), single-tenant, PaaS. The reference build these artifacts are
  reverse-engineered from.
- **Invasive-species non-profit** (next) — events + field data collection.
  Stresses *different* dials: offline-first capture, geo/media data, scientific
  provenance over financial correctness. The first real test of whether the
  method reproduces quality on a different problem shape.

## Maturity ladder (where this is headed)

- **L0 — Documents** *(here)*: Charter + Rubric + Playbook. Humans and AI read them.
- **L1 — `/bootstrap` skill**: a Claude Code skill that runs Rubric → Playbook,
  scaffolds the project, and enforces the gates. These docs are structured to be
  executed by it.
- **L2 — Harness/CLI**: orchestrates coding agents across milestones, runs the
  gates, wires CI/CD + envs + monitoring from templates.
- **L3 — Platform**: multi-user, templates, dashboards — the studio-in-a-box.

Climb only when the current level is *proven* on real projects.

## Changelog

- **v0.1** — Initial capture, reverse-engineered from the Avani build; calibrated against the invasive-species non-profit app as the second case.
