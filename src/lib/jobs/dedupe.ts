/**
 * Duplicate rejection. Every incoming posting (feed refresh or manual capture)
 * goes through resolveIncoming before anything is written, and the result
 * decides whether it becomes a new posting, refreshes an existing one, is
 * recorded only as an alias of an existing one, or is dropped because the
 * owner deleted it. A duplicate is never stored as a second posting; the
 * unique JobPosting.dedupeKey index enforces that at the database too.
 *
 * Pure functions (unit-tested).
 */

const TITLE_ABBREVIATIONS: [RegExp, string][] = [
  [/\bsr\b\.?/g, "senior"],
  [/\bjr\b\.?/g, "junior"],
  [/\bswe\b/g, "software engineer"],
  [/\beng\b\.?/g, "engineer"],
  [/\bdev\b\.?/g, "developer"],
  [/\bmgr\b\.?/g, "manager"],
  [/\bprin\b\.?/g, "principal"],
  [/\bfull[- ]?stack\b/g, "fullstack"],
  [/\bback[- ]?end\b/g, "backend"],
  [/\bfront[- ]?end\b/g, "frontend"],
];

/** "Sr. Software Eng (Remote) - R12345" → "senior software engineer". */
export function normalizeTitle(title: string): string {
  let t = title.toLowerCase();
  t = t.replace(/\([^)]*\)/g, " "); // "(Remote)", "(Hybrid)", "(CMS)"
  t = t.replace(/\b(req(uisition)?|job)\s*(id|#|no\.?)?\s*[:#]?\s*[a-z]*\d[\w-]*/g, " "); // "Req ID: 12345"
  t = t.replace(/\s[-–|,]\s*(r|jr|req)?\d[\w-]*\s*$/g, " "); // trailing " - R12345"
  t = t.replace(/\s[-–|,]\s*(remote|hybrid|on[- ]?site)\b.*$/g, " ");
  for (const [re, to] of TITLE_ABBREVIATIONS) t = t.replace(re, to);
  return t.replace(/[^a-z0-9+#]+/g, " ").trim().replace(/\s+/g, " ");
}

const COMPANY_SUFFIXES =
  /\b(inc|incorporated|llc|l\.l\.c|corp|corporation|co|company|ltd|limited|lp|llp|pbc|plc|group|holdings)\b\.?/g;

/** "The Booz Allen Hamilton, Inc." → "booz allen hamilton". */
export function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/^the\s+/, "")
    .replace(COMPANY_SUFFIXES, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const STATES: Record<string, string> = {
  maryland: "md", virginia: "va", "district of columbia": "dc", "washington dc": "dc",
  pennsylvania: "pa", delaware: "de", "new york": "ny", california: "ca", texas: "tx",
  massachusetts: "ma", colorado: "co", illinois: "il", georgia: "ga", "north carolina": "nc",
};

/**
 * Any remote mention → "remote" (the same job is often listed as "Remote" on
 * one board and "Baltimore, MD (Remote)" on another). Otherwise "city, st".
 */
export function normalizeLocation(location: string): string {
  const l = location.toLowerCase();
  if (/\b(remote|anywhere|telecommute|work from home)\b/.test(l)) return "remote";
  let out = l.replace(/,?\s*(united states( of america)?|usa|us)\.?$/, "");
  for (const [name, abbr] of Object.entries(STATES)) out = out.replace(new RegExp(`\\b${name}\\b`, "g"), abbr);
  return out.replace(/[^a-z0-9,]+/g, " ").replace(/\s*,\s*/g, ", ").trim().replace(/\s+/g, " ");
}

export function dedupeKey(p: { title: string; companyName: string; location: string }): string {
  return [normalizeTitle(p.title), normalizeCompany(p.companyName), normalizeLocation(p.location)].join(" | ");
}

export type Incoming = {
  source: string;
  sourceJobId: string;
  title: string;
  companyName: string;
  location: string;
};

export type ExistingIndex = {
  /** "SOURCE:sourceJobId" of every posting and alias → posting id. */
  bySourceId: Map<string, string>;
  /** dedupeKey → posting id. */
  byKey: Map<string, string>;
  /** "SOURCE:sourceJobId" and dedupe keys of deleted postings. */
  dismissedSourceIds: Set<string>;
  dismissedKeys: Set<string>;
};

export type Resolution =
  /** Never seen: create a posting. */
  | { action: "create"; dedupeKey: string }
  /** Same source + id (or an alias of it): refresh lastSeenAt / reopen. */
  | { action: "refresh"; postingId: string; dedupeKey: string }
  /** Same job from another source or under a new id: store an alias only. */
  | { action: "alias"; postingId: string; dedupeKey: string }
  /** The owner deleted it: drop silently. */
  | { action: "dismissed"; dedupeKey: string };

export const sourceIdKey = (source: string, sourceJobId: string) => `${source}:${sourceJobId}`;

export function resolveIncoming(p: Incoming, index: ExistingIndex): Resolution {
  const key = dedupeKey(p);
  const sid = sourceIdKey(p.source, p.sourceJobId);
  if (index.dismissedSourceIds.has(sid) || index.dismissedKeys.has(key)) return { action: "dismissed", dedupeKey: key };
  const exact = index.bySourceId.get(sid);
  if (exact) return { action: "refresh", postingId: exact, dedupeKey: key };
  const sameJob = index.byKey.get(key);
  if (sameJob) return { action: "alias", postingId: sameJob, dedupeKey: key };
  return { action: "create", dedupeKey: key };
}

/** Within one refresh batch, later duplicates of an earlier item are aliases of it. */
export function resolveBatch(items: Incoming[], index: ExistingIndex): { item: Incoming; resolution: Resolution }[] {
  const pendingByKey = new Map<string, string>();
  return items.map((item) => {
    const resolution = resolveIncoming(item, index);
    if (resolution.action === "create") {
      const first = pendingByKey.get(resolution.dedupeKey);
      if (first) return { item, resolution: { action: "alias", postingId: `pending:${first}`, dedupeKey: resolution.dedupeKey } };
      pendingByKey.set(resolution.dedupeKey, sourceIdKey(item.source, item.sourceJobId));
    }
    return { item, resolution };
  });
}

/**
 * Delete guard: postings with an application on record keep their history.
 * They can be archived, never deleted.
 */
export function canDeletePosting(p: { status: string; appliedResumeId: string | null; appliedAt: Date | null }): boolean {
  const applied = ["APPLIED", "INTERVIEWING", "OFFER"].includes(p.status) || p.appliedAt !== null || p.appliedResumeId !== null;
  return !applied;
}
