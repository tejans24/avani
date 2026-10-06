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

export const SCORING_VERSION = 5;

/*
 * Criteria (owner, Oct 2026). Must-haves: whole-problem scope; hands-on with
 * design authority; mission (public benefit, health, infrastructure,
 * environment, civic); remote or within ~1 hr of Baltimore; stable,
 * lender-recognizable pay (see PAY below); a
 * competent person above. Dealbreakers: daily status reporting, narrow ticket
 * work, domain requirements that can't be honestly met, day-one certs with no
 * path, vendor-deliverable oversight programs, 50%+ travel.
 */

/**
 * Pay, in one place: the hard filter, the score bands, the fit check and the
 * evaluator prompt all read these. Change them here, bump SCORING_VERSION,
 * and the next refresh rescores everything.
 *
 * floor: a whole posted range under this is filtered out (Oct 2026: lowered
 * from $180K to $130K for now). target: what the search is really for.
 */
export const PAY = {
  floorCents: 130_000_00,
  targetMinCents: 185_000_00,
  targetMaxCents: 215_000_00,
};

/**
 * Résumé length, in pages. Two is the norm at 15+ years, and USAJOBS caps
 * federal résumés at two. Raise it for one lane if that market expects more
 * (e.g. GOV_CONTRACTOR: 3); the preview warns over the limit and tailoring
 * aims for it.
 */
export const RESUME_PAGES: { default: number; byLane: Partial<Record<Lane, number>> } = {
  default: 2,
  byLane: {},
};
export const maxResumePages = (lane?: Lane | null) => (lane && RESUME_PAGES.byLane[lane]) || RESUME_PAGES.default;

/** $185K */
export const payK = (cents: number) => `$${Math.round(cents / 100_000)}K`;

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

export type WorkMode = "REMOTE" | "OCCASIONAL_HYBRID" | "HYBRID" | "ONSITE" | "UNKNOWN";

/**
 * Work-mode classification, checked in order: the first group with a match
 * decides. Source-provided flags (e.g. Greenhouse "Remote" location, Workday
 * remoteType) are applied first; these patterns read the description.
 */
export const WORK_MODE_PATTERNS: { mode: WorkMode; patterns: RegExp[] }[] = [
  {
    mode: "ONSITE",
    patterns: [
      /\b(100% (on[- ]?site|in[- ]office)|fully on[- ]?site|on[- ]?site (position|role) (only)?|not (a )?remote|no remote)\b/i,
      /\b(5|five) days (a|per|each) week (in|on)[- ]?(the )?(office|site)\b/i,
      /\b(in[- ]office|on[- ]?site) (5|five) days\b/i,
    ],
  },
  {
    mode: "HYBRID",
    patterns: [
      /\b[2-5]\s*(\+\s*)?(days?|x) (a|per|each) week (in|on)[- ]?(the )?(office|site)\b/i,
      /\b(in[- ]office|on[- ]?site) [2-5] days\b/i,
    ],
  },
  {
    mode: "OCCASIONAL_HYBRID",
    patterns: [
      /\b(occasional|periodic|infrequent|as[- ]needed) (travel|visits?|on[- ]?site|in[- ]office|meetings?)\b/i,
      /\b(once|1-2 days?|one day|a few days) (a|per) (month|quarter)\b/i,
      /\b(monthly|quarterly) (on[- ]?site|in[- ]person|team) (visits?|meetings?|days?|gatherings?)\b/i,
      /\bremote[^.]{0,60}\b(occasional|as needed)\b/i,
      // "Work site is primarily at the employee's home site; ... occasionally need to work at the customer site"
      /\b(work ?site|work location|work)\b[^.]{0,20}\b(is )?(primarily|mostly|mainly) (at|from) (the )?(employee['’]?s? |your )?home\b/i,
      /\boccasionally (need to )?(work|be|report|travel)\b[^.]{0,40}\b(on[- ]?site|customer site|client site|office)\b/i,
    ],
  },
  // Remote offered as one of the options ("a hybrid, remote, or client-site environment as program needs
  // require", "remote or hybrid"): it depends on the program, so it's not stated. Ask.
  {
    mode: "UNKNOWN",
    patterns: [
      /\b(hybrid|on[- ]?site|client[- ]site|in[- ]office)\s*(,|\/|or|and\/or)\s*(an?\s+)?remote\b/i,
      /\bremote\s*(,|\/|or|and\/or)\s*(an?\s+)?(hybrid|on[- ]?site|client[- ]site|in[- ]office)\b/i,
    ],
  },
  // Generic "hybrid" with no occasional qualifier → assume regular hybrid.
  // ("Hybrid cloud", "hybrid IT" and the like are technology, not a schedule.)
  { mode: "HYBRID", patterns: [/\bhybrid\b(?!\s*(cloud|it\b|infrastructure|architectures?|environments?|multi-?cloud|on-?prem|data|integration|solutions?|deployments?|networks?|apps?|applications?))/i] },
  {
    mode: "REMOTE",
    patterns: [/\b(fully remote|100% remote|remote[- ]first|remote \(us\)|remote[- ]us|work from anywhere in the us)\b/i, /\bremote\b/i],
  },
];

/**
 * Title prefilter, applied before detail fetches and scoring so unrelated
 * roles (sales, mechanical, interns) never enter the database. Kept broad on
 * purpose: scoring does the real ranking.
 */
export const TITLE_PREFILTER = {
  include: /\b(engineer|engineering|developer|architect|programmer|software|tech(nical)? lead|cto|full[- ]?stack|back[- ]?end|platform|data|ml|ai)\b/i,
  exclude:
    /\b(intern|internship|co-op|junior|jr\.?|entry[- ]level|apprentice|sales|account (executive|manager)|recruiter|mechanical|electrical|civil|structural|chemical|hardware|manufacturing|field (service )?engineer|test technician|help ?desk|desktop support|nurse|physician)\b/i,
};

export function passesTitlePrefilter(title: string): boolean {
  return TITLE_PREFILTER.include.test(title) && !TITLE_PREFILTER.exclude.test(title);
}

export const HARD_FILTERS = {
  maxPostedAgeDays: 30,

  /**
   * Default: remote, or remote with occasional in-office days at a
   * commutable office. Regular hybrid and onsite are filtered out (still
   * viewable under "Filtered out"). UNKNOWN passes but is flagged.
   */
  allowedWorkModes: ["REMOTE", "OCCASIONAL_HYBRID", "UNKNOWN"] as WorkMode[],
  /** Work modes that also require the office to be in commutableLocations. */
  workModesNeedingCommute: ["OCCASIONAL_HYBRID", "HYBRID", "ONSITE"] as WorkMode[],
  workModeUnknownFlag: "Work arrangement not stated",

  /** Offices within ~1 hr of Baltimore, matched against the location string. */
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
    /\bmust (currently )?(hold|possess|have) (an? )?active (dod |doe |dhs )?(secret|top secret)\b/i,
    /\bminimum clearance required to start:\s*(secret|top secret|ts\/sci)\b/i,
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

  /** Pay: reject only when the whole posted range is under PAY.floorCents. A range that straddles it is scored. */
  compFloorCents: PAY.floorCents,

  /** Dealbreaker: heavy travel. */
  travelRejectPatterns: [
    /\b(up to |approximately |about |~)?([5-9]\d|100)\s?%\s*(of the time )?(travel|travelling|traveling)\b/i,
    /\btravel (up to |approximately |about |~)?([5-9]\d|100)\s?%/i,
  ],

  /** Dealbreaker: daily status reporting as a core duty. */
  statusReportingRejectPatterns: [
    /\b(prepare|provide|produce|submit|deliver)s? daily (status|progress) reports?\b/i,
    /\bdaily (status|progress) reports? (to|for) (the )?(client|government|cor|pm|program manager)\b/i,
  ],

  /**
   * Dealbreaker: a certification required on day one with no path around it.
   * Passes when the posting allows obtaining it after hire.
   */
  requiredCertRejectPatterns: [
    /\b(must|required to) (currently )?(hold|have|possess)[^.]{0,60}\b(security\+|cissp|cism|casp\+?|ccsp|pmp|itil|ccna|aws certified[\w -]*|azure (administrator|solutions architect)[\w -]*)(?!\w)/i,
    /\b(dod|doD) (8570|8140)\b[^.]{0,60}\b(required|must)\b/i,
    /\biat (level )?(ii|iii|2|3)\b[^.]{0,40}\brequired\b/i,
  ],
  requiredCertAllowPatterns: [
    /\b(within|in) (the first )?\d+ (days|months)( of (hire|start|employment))?\b/i,
    /\b(ability|able|willing(ness)?) to obtain\b[^.]{0,40}\b(cert|certification|security\+|cissp)/i,
  ],

  /**
   * Mission is a must-have: these industries are rejected outright. Positive
   * mission signals are scored below (MISSION_RULES); an unclear mission is
   * flagged, not rejected.
   */
  antiMissionPatterns: [
    /\b(ad[- ]?tech|programmatic advertising|demand[- ]side platform|real[- ]time bidding|ad (network|exchange)s?)\b/i,
    /\b(sports betting|online casino|igaming|gambling)\b/i,
  ],
};

// ---------------------------------------------------------------------------
// Scoring: start at BASE_SCORE, add every matching rule's points, cap each
// category, clamp to 0–100. Every applied rule is recorded in the breakdown
// with the text that triggered it.
//
// Weighting follows the owner's criteria: scope and design authority matter
// most (the "miserable in six months" predictor), then mission and pay, then
// the kind of work (AI, modernization, team size), then stack and tempo.
// ---------------------------------------------------------------------------

/** Max possible ≈ 30 + 20 + 12 + 15 + 15 + 10 = 102, so great postings stay distinguishable. */
export const BASE_SCORE = 30;

export type Rule = {
  id: string;
  label: string;
  points: number;
  pattern: RegExp;
};

/** Comp uses the posted range midpoint (annualized). Highest band wins. Derived from PAY. */
const BELOW_TARGET_CENTS = Math.round((PAY.floorCents + PAY.targetMinCents) / 2 / 500_000) * 500_000;
export const COMP_BANDS = [
  { minCents: PAY.targetMinCents + 15_000_00, points: 15, label: `Midpoint ≥ ${payK(PAY.targetMinCents + 15_000_00)}` },
  { minCents: PAY.targetMinCents, points: 12, label: `Midpoint in the ${payK(PAY.targetMinCents)}–${payK(PAY.targetMaxCents)} target` },
  { minCents: BELOW_TARGET_CENTS, points: 2, label: `Midpoint ${payK(BELOW_TARGET_CENTS)}–${payK(PAY.targetMinCents)} (under target)` },
  { minCents: PAY.floorCents, points: -4, label: `Midpoint ${payK(PAY.floorCents)}–${payK(BELOW_TARGET_CENTS)} (well under target)` },
  { minCents: 0, points: -10, label: `Midpoint < ${payK(PAY.floorCents)} (range straddles the floor)` },
] as const;
/** No posted range: neutral score, but flagged in the UI. */
export const COMP_MISSING_FLAG = "No comp range posted";

export type Category = "scope" | "mission" | "comp" | "work" | "stack" | "redFlags";

export const CATEGORY_CAPS: Record<Category, { min: number; max: number }> = {
  scope: { min: -25, max: 20 },
  mission: { min: 0, max: 12 },
  comp: { min: -10, max: 15 },
  work: { min: -10, max: 15 },
  stack: { min: 0, max: 10 },
  redFlags: { min: -30, max: 0 },
};

/**
 * Scope + design authority: own a system or product end to end, hands-on,
 * deciding how it's built. Architect or lead titles are fine when the job
 * also writes code; architect-only and narrow ticket work are not.
 */
export const SCOPE_RULES: Rule[] = [
  { id: "end-to-end", label: "End-to-end ownership of a system or product", points: 8,
    pattern: /\b(end[- ]to[- ]end|own (the )?(entire|whole|full)|full (technical )?ownership|from (discovery|concept|design) (through|to) (production|delivery|launch))\b/i },
  { id: "design-authority", label: "Decides how it's built (architecture / technical direction)", points: 6,
    pattern: /\b(architecture decisions|technical direction|design and (build|implement|develop)|architect and (build|implement|develop)|set(ting)? the technical (strategy|direction)|technical decision[- ]mak(ing|er))\b/i },
  { id: "hands-on", label: "Explicitly hands-on", points: 5,
    pattern: /(?<!\bnot (a |an )?)(?<!\bno )\b(hands[- ]on|write (production )?code|coding (architect|lead)|player[- ]coach|individual contributor)\b/i },
  { id: "greenfield-or-rebuild", label: "Greenfield build or full rebuild", points: 4,
    pattern: /\b(greenfield|build (it |the platform |the system )?from (the ground up|scratch)|net[- ]new (platform|system|product))\b/i },
  { id: "architect-only", label: "Architect-only (no coding)", points: -12,
    pattern: /\b(not a (hands[- ]on|coding) role|no (hands[- ]on )?coding|will not (write|be writing) code|enterprise architect|architecture (review )?board|governance (artifacts|documentation) (only|primarily))\b/i },
  { id: "narrow-ticket-work", label: "Narrow ticket / maintenance work", points: -15,
    pattern: /\b(work (assigned|on assigned) (tickets|stories)|resolve (help ?desk |service ?now |jira )?tickets|(bug fixes|break[- ]fix) (and|&) (enhancements|maintenance)|operations and maintenance \(o&m\)|sustainment (and|&) maintenance)\b/i },
  { id: "people-manager", label: "People-management role", points: -8,
    pattern: /\b(engineering manager|manage a team of|direct reports|performance reviews for)\b/i },
  { id: "vendor-oversight", label: "Oversight of other vendors' deliverables", points: -15,
    pattern: /\b((oversee|monitor|track|review) (other )?(vendor|contractor)s?'? deliverables|vendor management|iv&v|independent verification and validation|integrated master schedule)\b/i },
];

/** Mission you'd explain to your kids. Gov/health/climate lanes get credit too. */
export const MISSION_RULES: Rule[] = [
  { id: "health", label: "Health / patients / care", points: 6,
    pattern: /\b(patients?|health ?care|public health|medicaid|medicare|clinical|care delivery|veterans'? (health|benefits))\b/i },
  { id: "public-benefit", label: "Public benefit / civic services", points: 6,
    pattern: /\b(public benefit|civic|benefits (delivery|programs)|social services|snap|unemployment insurance|veterans|grants?|nonprofit|non-profit|government services|serve (the public|residents|citizens))\b/i },
  { id: "environment", label: "Environment / climate / conservation", points: 6,
    pattern: /\b(climate|conservation|environment(al)?|clean energy|decarboni[sz]|biodiversity|land trust)\b/i },
  { id: "infrastructure", label: "Public infrastructure", points: 4,
    pattern: /\b(public infrastructure|transportation|transit|water systems|broadband|critical infrastructure)\b/i },
];
export const MISSION_UNCLEAR_FLAG = "Mission unclear from the posting";
/** Lanes that count as mission even with no keyword hit. */
export const MISSION_LANES: Lane[] = ["GOV_CONTRACTOR", "HEALTH_SYSTEM", "CLIMATE_CONSERVATION"];

/** The kind of work: AI in the core, modernization/integration, team size. */
export const WORK_RULES: Rule[] = [
  { id: "ai-core", label: "AI as part of the work (LLMs, RAG, evaluation)", points: 8,
    pattern: /\b(llms?|large language models?|rag|retrieval[- ]augmented|generative ai|genai|ai (agents?|platform|systems)|model evaluation|evals|guardrails|prompt engineering|machine learning (platform|systems))\b/i },
  { id: "legacy-modernization", label: "Legacy modernization", points: 6,
    pattern: /\b(legacy (system|application|modernization|migration)s?|moderni[sz](e|ation|ing)|mainframe|cobol|strangler|migrat(e|ion|ing) (off|from) (legacy|on[- ]?prem))\b/i },
  { id: "integration-heavy", label: "Integration-heavy (APIs, interoperability, data exchange)", points: 5,
    pattern: /\b(interoperability|systems integration|integrat(e|ion|ing) (with )?(multiple|disparate|legacy|external|third[- ]party) (systems|sources|partners)|data exchange|fhir|hl7|x12|edi)\b/i },
  { id: "small-team", label: "Small team where breadth matters", points: 4,
    pattern: /\b(small (engineering |product |cross[- ]functional )?team|team of ([3-9]|1[0-2])\b|tight[- ]knit team)\b/i },
  { id: "large-program", label: "Very large program (breadth is noise)", points: -5,
    pattern: /\b(team of (\d{3,}|[2-9]\d)|\d{3,}\+? (engineers|developers|person program)|one of (dozens|hundreds) of)\b/i },
  { id: "contingent-award", label: "Contingent upon contract award", points: -8,
    pattern: /\b(contingent (up)?on (contract )?award|pending (contract )?award)\b/i },
  { id: "period-of-performance", label: "Awarded work with period of performance / option years", points: 4,
    pattern: /\b(period of performance|option years?|base year plus)\b/i },
];

/**
 * The company holds a current federal contract award (USAspending, see
 * awards.ts): awarded work, not "contingent upon award". Counts in "work".
 */
export const CURRENT_AWARD_POINTS = 4;

/** Stack match: a light tiebreaker now; each distinct hit counts once. */
export const STACK_RULES: Rule[] = [
  { id: "aws-serverless", label: "AWS serverless (API Gateway, Lambda, Step Functions)", points: 3,
    pattern: /\b(api gateway|lambda|step functions)\b/i },
  { id: "aws-containers", label: "AWS containers (ECS/EKS)", points: 2,
    pattern: /\b(ecs|eks|fargate)\b/i },
  { id: "aws-data", label: "AWS data (DynamoDB, Glue, Redshift, Athena)", points: 2,
    pattern: /\b(dynamodb|aws glue|redshift|athena)\b/i },
  { id: "event-driven", label: "Event-driven systems / Kafka", points: 3,
    pattern: /\b(event[- ]driven|kafka|kinesis|eventbridge|pub\/sub|message queues?)\b/i },
  { id: "canonical-data-model", label: "Canonical data models", points: 2,
    pattern: /\b(canonical (data )?model|data model(l)?ing|master data)\b/i },
  { id: "fhir-healthcare", label: "FHIR / healthcare interoperability", points: 3,
    pattern: /\b(fhir|hl7|interoperability|ehr|cms\.gov|medicaid|medicare)\b/i },
  { id: "oauth-oidc", label: "OAuth2 / OIDC", points: 2,
    pattern: /\b(oauth ?2?|openid connect|oidc|login\.gov)\b/i },
  { id: "llm-rag", label: "RAG / LLM evaluation and guardrails", points: 3,
    pattern: /\b(rag|retrieval[- ]augmented|llm|guardrails|evals?|generative ai)\b/i },
  { id: "typescript-react", label: "TypeScript / React", points: 2,
    pattern: /\b(typescript|react)\b/i },
  { id: "python", label: "Python", points: 2, pattern: /\bpython\b/i },
  { id: "postgres", label: "Postgres", points: 1, pattern: /\b(postgres(ql)?)\b/i },
];

/** Red flags: each distinct hit counts once; category capped at −30. */
export const RED_FLAG_RULES: Rule[] = [
  { id: "fast-paced-startup", label: "\"Fast-paced startup\" (pay stability)", points: -5,
    pattern: /\bfast[- ]paced (startup|start-up)\b/i },
  { id: "founding", label: "Founding / first engineering hire", points: -8,
    pattern: /\b(founding engineer|first (engineering )?hire|engineer #?\s?[1-5]\b)/i },
  { id: "series-a-c", label: "Series A–C (not lender-recognizable yet)", points: -6,
    pattern: /\bseries [abc]\b/i },
  { id: "pager-tempo", label: "Pager-driven tempo (\"zero downtime\" identity, 24/7 on-call)", points: -8,
    pattern: /\b(zero (downtime|outages)|no downtime|24\/7 on[- ]call|on[- ]call (rotation )?(every|weekly)|always[- ]on support|99\.99+% (uptime|availability) (is|are) (critical|mandatory|required))\b/i },
  { id: "weekly-status-reporting", label: "Recurring status reporting", points: -4,
    pattern: /\b(weekly|bi-?weekly) (status|progress) reports?\b/i },
  { id: "java-csharp-expert", label: "Expert Java / C# required", points: -6,
    pattern: /\b(expert|deep|extensive|\d+\+ years)[^.]{0,40}\b(java|c#|\.net)\b/i },
];

/**
 * Domain requirements the owner can't honestly meet (e.g. the utilities
 * posting). Flagged with a penalty rather than rejected, because "nice to
 * have" and "required" read alike; the owner decides.
 */
export const DOMAIN_GAP_RULES: Rule[] = [
  { id: "utilities-domain", label: "Requires utilities-industry experience", points: -10,
    pattern: /\b(experience|background) (in|with) (the )?(electric |gas |water )?utilit(y|ies)( industry| sector)?\b/i },
];

// ---------------------------------------------------------------------------
// Lanes: highest total hits wins; ties → UNCLASSIFIED. USAJOBS postings and
// known contractors are GOV_CONTRACTOR regardless.
// ---------------------------------------------------------------------------

export const KNOWN_GOV_CONTRACTORS = [
  "caci", "gdit", "general dynamics information technology", "leidos", "saic",
  "booz allen", "booz allen hamilton", "actionet", "peraton", "maximus", "nava",
  "ad hoc", "skylight", "oddball", "truss", "coforma", "bixal", "fearless",
  "eastern research group", "abt global", "abt associates", "industrial economics",
  "tetra tech", "i.m. systems group", "imsg", "earth resources technology",
  "global science & technology", "science systems and applications", "adnet",
  "lynker", "riverside technology", "science and technology corporation", "dewberry",
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
// Verify on the call: must-haves no posting can prove. Shown as a checklist
// on every job; answers live in JobCompany.questions. An offer should not be
// accepted with "competentManager" unanswered or "no".
// ---------------------------------------------------------------------------

export const INTERVIEW_QUESTIONS = [
  { key: "competentManager", label: "Who would I report to, and do they decide on technical grounds and use what I know?", mustHave: true },
  { key: "wholeProblemScope", label: "Do I own a system or product end to end, or a slice of one?", mustHave: true },
  { key: "designAuthority", label: "Do I write code and decide how it's built?", mustHave: true },
  { key: "outsideWorkPolicy", label: "Outside work allowed? Any conflict with commercial healthcare clients?", mustHave: true },
  { key: "ipCarveOut", label: "IP assignment carve-out for prior and outside work?", mustHave: true },
  { key: "teamSize", label: "How big is the team and the program?", mustHave: false },
  { key: "opsTempo", label: "On-call and uptime expectations in practice?", mustHave: false },
  { key: "statusReporting", label: "How much status reporting is part of the job?", mustHave: false },
  { key: "certRequirements", label: "Any certifications required, and is there a grace period?", mustHave: false },
  { key: "aiInTheWork", label: "Is AI part of the actual work? Which AI coding tools are approved?", mustHave: false },
  { key: "primeOrSub", label: "Prime or sub on the contract?", mustHave: false },
  { key: "awardedOrContingent", label: "Awarded, or contingent upon award?", mustHave: false },
  { key: "optionYears", label: "Period of performance and option years remaining?", mustHave: false },
  { key: "level", label: "What level is this, and what does the next level look like?", mustHave: false },
] as const;
