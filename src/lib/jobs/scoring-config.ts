/**
 * Job-finder scoring config — the single place the search criteria live.
 * Pure data: the filter and scoring engine (scoring.ts) reads only from here,
 * so tuning the search means editing this file and nothing else.
 *
 * Bump SCORING_VERSION after any change; the next refresh rescores every
 * open posting whose scoringVersion is older.
 *
 * Patterns are matched case-insensitively against title + description.
 */

export const SCORING_VERSION = 1;

export type Lane =
  | "GOV_CONTRACTOR"
  | "COMMERCIAL_PLATFORM"
  | "HEALTH_SYSTEM"
  | "CLIMATE_CONSERVATION"
  | "INTERNAL_TOOLS"
  | "UNCLASSIFIED";

// ---------------------------------------------------------------------------
// Hard filters: failing any one rejects the posting (it is still stored and
// scored, so rejections can be reviewed under "Filtered out").
// ---------------------------------------------------------------------------

export const HARD_FILTERS = {
  maxPostedAgeDays: 30,

  /** Remote is always fine if US-based. Hybrid/onsite must be one of these. */
  commutableLocations: [
    // ~1 hr of Baltimore. Matched against the posting's location string.
    "baltimore", "towson", "columbia, md", "ellicott city", "catonsville",
    "owings mills", "hunt valley", "glen burnie", "linthicum", "hanover, md",
    "fort meade", "annapolis junction", "odenton", "annapolis", "laurel",
    "bwi", "aberdeen", "bel air", "silver spring", "college park",
    "greenbelt", "lanham", "bethesda", "rockville", "gaithersburg",
    "germantown", "frederick", "washington, dc", "washington dc",
  ],

  /** Signals a posting is not US-based (unless it also says remote US). */
  nonUsPatterns: [
    /\b(canada|united kingdom|uk only|emea|apac|latam|india|europe only)\b/i,
    /\bremote\s*[-–(]\s*(canada|uk|eu|europe|mexico)\b/i,
  ],

  /** Reject: clearance above Public Trust required to start. */
  clearanceRejectPatterns: [
    /\b(top secret|ts\/sci|ts\s*\/\s*sci|tssci)\b/i,
    /\b(polygraph|full[- ]scope poly|ci poly)\b/i,
    /\bactive secret (clearance )?(is )?required\b/i,
    /\bmust (currently )?(hold|possess|have) an? (active )?secret\b/i,
  ],
  /** Allow even if a reject pattern also matched (e.g. "willing to obtain"). */
  clearanceAllowPatterns: [
    /\b(able|ability|willing(ness)?|eligible) to obtain (a |an )?(secret|public trust)\b/i,
    /\bpublic trust\b/i,
  ],

  /** Recruiting/staffing reposts. Also: JobCompany.isStaffingAgency. */
  staffingAgencyPatterns: [
    /\bour client\b/i,
    /\bon behalf of (our|a) client\b/i,
    /\b(staffing|recruiting) (firm|agency|partner)\b/i,
    /\bc2c\b|\bcorp[- ]to[- ]corp\b/i,
  ],
};

// ---------------------------------------------------------------------------
// Scoring: start at BASE_SCORE, add every matching rule's points, cap each
// category, clamp to 0–100. Every applied rule is recorded in the breakdown
// with the text that triggered it.
// ---------------------------------------------------------------------------

export const BASE_SCORE = 50;

export type Rule = {
  id: string;
  label: string;
  points: number;
  pattern: RegExp;
};

/** Comp uses the posted range midpoint (annualized). Highest band wins. */
export const COMP_BANDS = [
  { minCents: 200_000_00, points: 20, label: "Midpoint ≥ $200K" },
  { minCents: 180_000_00, points: 12, label: "Midpoint ≥ $180K" },
  { minCents: 160_000_00, points: 0, label: "Midpoint $160–180K" },
  { minCents: 0, points: -15, label: "Midpoint < $160K" },
] as const;
/** No posted range: neutral score, but flagged in the UI. */
export const COMP_MISSING_FLAG = "No comp range posted";

export const CATEGORY_CAPS: Record<
  "comp" | "shape" | "stack" | "redFlags",
  { min: number; max: number }
> = {
  comp: { min: -15, max: 20 },
  shape: { min: -20, max: 15 },
  stack: { min: 0, max: 25 },
  redFlags: { min: -30, max: 0 },
};

/** Role shape: IC engineer on a team with a manager and defined work. */
export const SHAPE_RULES: Rule[] = [
  { id: "ic-engineer-title", label: "IC engineer title", points: 6,
    pattern: /\b(senior|staff|lead)?\s*(software|platform|data|backend|full[- ]?stack|cloud) engineer\b/i },
  { id: "architect-title", label: "Architect title", points: -5,
    pattern: /\barchitect\b/i },
  { id: "lead-title", label: "Tech lead / lead role", points: -4,
    pattern: /\b(tech(nical)? lead|team lead|engineering lead)\b/i },
  { id: "people-manager", label: "People-management role", points: -8,
    pattern: /\b(engineering manager|manage a team of|direct reports)\b/i },
  { id: "ticket-driven", label: "Defined, ticket-driven work", points: 4,
    pattern: /\b(jira|user stories|sprint(s)?|scrum|agile team|backlog)\b/i },
  { id: "reports-to-manager", label: "Reports to an engineering manager", points: 3,
    pattern: /\breports? to (the |an? )?(engineering manager|software manager|director)\b/i },
  { id: "contingent-award", label: "Contingent upon contract award", points: -10,
    pattern: /\b(contingent (up)?on (contract )?award|pending (contract )?award)\b/i },
  { id: "period-of-performance", label: "Period of performance / option years", points: 5,
    pattern: /\b(period of performance|option years?|base year plus)\b/i },
];

/** Stack match: each distinct hit counts once; category capped at +25. */
export const STACK_RULES: Rule[] = [
  { id: "aws-serverless", label: "AWS serverless (API Gateway, Lambda, Step Functions)", points: 5,
    pattern: /\b(api gateway|lambda|step functions)\b/i },
  { id: "aws-containers", label: "AWS containers (ECS/EKS)", points: 3,
    pattern: /\b(ecs|eks|fargate)\b/i },
  { id: "aws-data", label: "AWS data (DynamoDB, Glue, Redshift, Athena)", points: 4,
    pattern: /\b(dynamodb|aws glue|redshift|athena)\b/i },
  { id: "event-driven", label: "Event-driven systems / Kafka", points: 5,
    pattern: /\b(event[- ]driven|kafka|kinesis|eventbridge|pub\/sub|message queues?)\b/i },
  { id: "canonical-data-model", label: "Canonical data models", points: 3,
    pattern: /\b(canonical (data )?model|data model(l)?ing|master data)\b/i },
  { id: "fhir-healthcare", label: "FHIR / healthcare interoperability", points: 5,
    pattern: /\b(fhir|hl7|interoperability|ehr|cms\.gov|medicaid|medicare)\b/i },
  { id: "oauth-oidc", label: "OAuth2 / OIDC", points: 3,
    pattern: /\b(oauth ?2?|openid connect|oidc|login\.gov)\b/i },
  { id: "llm-rag", label: "RAG / LLM evaluation and guardrails", points: 5,
    pattern: /\b(rag|retrieval[- ]augmented|llm|guardrails|evals?|generative ai)\b/i },
  { id: "typescript-react", label: "TypeScript / React", points: 3,
    pattern: /\b(typescript|react)\b/i },
  { id: "python", label: "Python", points: 3, pattern: /\bpython\b/i },
  { id: "postgres", label: "Postgres", points: 2, pattern: /\b(postgres(ql)?)\b/i },
];

/** Red flags: each distinct hit counts once; category capped at −30. */
export const RED_FLAG_RULES: Rule[] = [
  { id: "fast-paced-startup", label: "\"Fast-paced startup\"", points: -6,
    pattern: /\bfast[- ]paced (startup|start-up|environment)\b/i },
  { id: "many-hats", label: "\"Wear many hats\"", points: -6,
    pattern: /\bwear (many|multiple) hats\b/i },
  { id: "founding", label: "Founding / first engineering hire", points: -8,
    pattern: /\b(founding engineer|first (engineering )?hire|engineer #?\s?[1-5]\b)/i },
  { id: "on-call-heavy", label: "Heavy on-call", points: -6,
    pattern: /\b(24\/7 on[- ]call|on[- ]call (rotation )?(every|weekly)|pager duty heavy)\b/i },
  { id: "series-a-c", label: "Series A–C company", points: -6,
    pattern: /\bseries [abc]\b/i },
  { id: "java-csharp-expert", label: "Expert Java / C# required", points: -8,
    pattern: /\b(expert|deep|extensive|\d+\+ years)[^.]{0,40}\b(java|c#|\.net)\b/i },
];
/** "Ownership" counts as a red flag only when it appears this often or more. */
export const OWNERSHIP_REPEAT = { threshold: 3, points: -5, label: "\"Ownership\" repeated" };

// ---------------------------------------------------------------------------
// Lanes: highest total hits wins; ties → UNCLASSIFIED. USAJOBS postings and
// known contractors are GOV_CONTRACTOR regardless.
// ---------------------------------------------------------------------------

export const KNOWN_GOV_CONTRACTORS = [
  "caci", "gdit", "general dynamics information technology", "leidos", "saic",
  "booz allen", "booz allen hamilton", "actionet", "peraton", "maximus", "nava",
  "ad hoc", "skylight", "oddball", "truss", "coforma", "bixal", "fearless",
];

export const LANE_PATTERNS: Record<Exclude<Lane, "UNCLASSIFIED">, RegExp[]> = {
  GOV_CONTRACTOR: [
    /\b(federal|government|agency|contract vehicle|prime contractor|subcontractor|cms|va\.gov|dhs|hhs)\b/i,
    /\b(public trust|period of performance|option years?)\b/i,
  ],
  COMMERCIAL_PLATFORM: [
    /\b(saas|platform team|developer platform|b2b|customers worldwide|multi-tenant)\b/i,
  ],
  HEALTH_SYSTEM: [
    /\b(health system|hospital|clinical|patient|epic|cerner|payer|provider network)\b/i,
  ],
  CLIMATE_CONSERVATION: [
    /\b(climate|carbon|decarboni[sz]ation|conservation|biodiversity|renewable|sustainability)\b/i,
  ],
  INTERNAL_TOOLS: [
    /\b(internal tools?|developer productivity|back[- ]office|employee[- ]facing|enterprise applications)\b/i,
  ],
};

/** Gov-lane postings get federal vocabulary in the tailored summary. */
export const FEDERAL_VOCABULARY_LANES: Lane[] = ["GOV_CONTRACTOR"];

// ---------------------------------------------------------------------------
// Per-company interview questions (JobCompany.questions keys).
// ---------------------------------------------------------------------------

export const INTERVIEW_QUESTIONS = [
  { key: "primeOrSub", label: "Prime or sub on the contract?" },
  { key: "awardedOrContingent", label: "Awarded, or contingent upon award?" },
  { key: "optionYears", label: "Period of performance and option years remaining?" },
  { key: "architectureOwner", label: "Who owns architecture decisions?" },
  { key: "aiToolsApproved", label: "Which AI coding tools are approved?" },
  { key: "outsideWorkPolicy", label: "Policy on outside work (keeping Avani)?" },
  { key: "ipCarveOut", label: "IP assignment carve-out for prior/outside work?" },
] as const;
