import type {
  ClientStage,
  ContactRole,
  InteractionDirection,
  InteractionType,
} from "@/lib/validations";

/**
 * The BD playbook — light, opinionated coaching for an owner who's new to
 * business development. Pure data + pure functions (unit-tested); the coach
 * engine (detect-bd.ts) and the Overview guidance panel both read from here so
 * the advice stays in one place.
 */

/**
 * Suggested contact cadence per stage, in days. Early relationships need
 * frequent touches; active clients need steady but lighter contact; past
 * clients aren't nudged. Drives the going-cold detector and the guidance panel.
 */
export const STAGE_CADENCE_DAYS: Record<ClientStage, number | null> = {
  LEAD: 3,
  PROSPECT: 7,
  ACTIVE: 30,
  PAST: null,
};

/** Human label per stage for badges and copy. */
export const STAGE_LABEL: Record<ClientStage, string> = {
  LEAD: "Lead",
  PROSPECT: "Prospect",
  ACTIVE: "Active",
  PAST: "Past",
};

/** One-line "what this stage means" helper text. */
export const STAGE_BLURB: Record<ClientStage, string> = {
  LEAD: "A new name you're pursuing. Goal: earn a real first conversation.",
  PROSPECT: "In active conversation about working together. Goal: a signed deal.",
  ACTIVE: "A paying client. Goal: deliver, stay close, and grow the account.",
  PAST: "Not currently active. Goal: keep the door open for the future.",
};

/**
 * Stage-exit checklists — "to advance from here, you generally want…".
 * Display-only guidance in v1 (not enforced or persisted); it teaches the
 * owner what "good" looks like at each stage.
 */
export const STAGE_CHECKLIST: Record<ClientStage, string[]> = {
  LEAD: [
    "Identify who the likely decision-maker is",
    "Find a warm intro or a specific reason to reach out",
    "Book a first call or meeting",
  ],
  PROSPECT: [
    "Map the buying group (champion, decision-maker, blockers)",
    "Understand their problem, budget, and timeline",
    "Send a proposal with clear scope and price",
  ],
  ACTIVE: [
    "Deliver the current work and keep them updated",
    "Keep a warm contact at least monthly",
    "Look for a next project or referral",
  ],
  PAST: [
    "Note why the relationship went quiet",
    "Set a reason to re-engage later (news, a new offering)",
  ],
};

/** Display label + a one-liner for each contact role (People tab, coaching). */
export const CONTACT_ROLE_LABEL: Record<ContactRole, string> = {
  DECISION_MAKER: "Decision-maker",
  CHAMPION: "Champion",
  INFLUENCER: "Influencer",
  BLOCKER: "Blocker",
  USER: "User",
  OTHER: "Other",
};

export const CONTACT_ROLE_BLURB: Record<ContactRole, string> = {
  DECISION_MAKER: "Signs off / controls budget. Win them and you win the deal.",
  CHAMPION: "Sells for you internally. Arm them with what they need.",
  INFLUENCER: "Shapes the decision without owning it. Keep them on side.",
  BLOCKER: "Can stall or kill it. Understand their objection early.",
  USER: "Lives with the work day to day. Their happiness drives renewal.",
  OTHER: "Someone worth knowing in the org.",
};

/** Display labels for the interaction timeline. */
export const INTERACTION_TYPE_LABEL: Record<InteractionType, string> = {
  EMAIL: "Email",
  CALL: "Call",
  MEETING: "Meeting",
  NOTE: "Note",
};

export const INTERACTION_DIRECTION_LABEL: Record<InteractionDirection, string> = {
  INBOUND: "Inbound",
  OUTBOUND: "Outbound",
  INTERNAL: "Internal",
};

/** Stages that count toward the open pipeline (not yet won, not lost). */
export const PIPELINE_STAGES: readonly ClientStage[] = ["LEAD", "PROSPECT"];

/**
 * Rough win-probability weights per stage, used only for a soft forecast.
 * Deliberately coarse — this is a nudge, not a CRM revenue model.
 */
export const STAGE_WIN_WEIGHT: Record<ClientStage, number> = {
  LEAD: 0.2,
  PROSPECT: 0.5,
  ACTIVE: 1,
  PAST: 0,
};

type PipelineClient = { stage: ClientStage; dealValueCents?: number | null };

/** Σ dealValueCents across open-pipeline clients (LEAD + PROSPECT). Raw total. */
export function pipelineValueCents(clients: readonly PipelineClient[]): number {
  return clients
    .filter((c) => PIPELINE_STAGES.includes(c.stage))
    .reduce((sum, c) => sum + (c.dealValueCents ?? 0), 0);
}

/** Stage-weighted pipeline forecast: Σ dealValueCents × stage win-weight. */
export function weightedPipelineCents(clients: readonly PipelineClient[]): number {
  return clients
    .filter((c) => PIPELINE_STAGES.includes(c.stage))
    .reduce((sum, c) => sum + Math.round((c.dealValueCents ?? 0) * STAGE_WIN_WEIGHT[c.stage]), 0);
}

/**
 * Whether a relationship has gone cold: no touch within the stage's cadence.
 * `lastContactAt` null means never contacted → cold once the client is older
 * than the cadence window (callers pass createdAt as the fallback). Returns
 * false for stages with no cadence (ACTIVE steady-state is handled by nudges,
 * PAST is never chased).
 */
export function isGoingCold(
  stage: ClientStage,
  lastContactAt: Date | null,
  now: Date,
  createdAt: Date
): boolean {
  const cadence = STAGE_CADENCE_DAYS[stage];
  if (cadence == null) return false;
  if (!PIPELINE_STAGES.includes(stage)) return false;
  const reference = lastContactAt ?? createdAt;
  const daysSince = Math.floor((now.getTime() - reference.getTime()) / 86_400_000);
  return daysSince >= cadence;
}
