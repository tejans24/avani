/**
 * Manual capture — turning a job page the owner already has open in their
 * own browser into a posting draft. Used by the bookmarklet (desktop), the
 * PWA share target (Android), the iOS Shortcut, and the paste form, for sites
 * that block server-side fetching.
 *
 * Pure functions (unit-tested). Most job pages embed schema.org JobPosting
 * JSON-LD for Google for Jobs; when present it gives structured title,
 * company, location, salary, date and remote flag. Otherwise the draft falls
 * back to the page title + visible text and the owner fills the gaps in the
 * preview form before saving. Nothing is saved without that confirmation.
 */

export type CapturePayload = {
  url: string;
  pageTitle?: string;
  /** Visible page text (document.body.innerText) or pasted description. */
  text?: string;
  /** Parsed contents of every <script type="application/ld+json"> on the page. */
  jsonLd?: unknown[];
};

export type CaptureDraft = {
  url: string;
  /** Stable id for MANUAL postings: the canonical URL. */
  sourceJobId: string;
  title?: string;
  companyName?: string;
  location?: string;
  remote: boolean;
  descriptionText: string;
  postedAt?: Date;
  /** Annualized, integer cents. */
  compMinCents?: number;
  compMaxCents?: number;
  /** Fields the owner must fill in the preview before saving. */
  missing: ("title" | "companyName" | "location" | "descriptionText")[];
};

const TRACKING_PARAMS = /^(utm_.*|gclid|fbclid|msclkid|mc_[ce]id|ref|refid|trk|trackingid|src|source|lipi|from|ccuid|gh_src)$/i;

/** Strip tracking params and fragments; normalize LinkedIn search links. */
export function canonicalJobUrl(raw: string): string {
  const u = new URL(raw.trim());
  u.hash = "";
  // LinkedIn search/collections pages carry the job in ?currentJobId=.
  const liJob = u.hostname.endsWith("linkedin.com") && u.searchParams.get("currentJobId");
  if (liJob) return `https://www.linkedin.com/jobs/view/${liJob}/`;
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
  }
  u.hostname = u.hostname.toLowerCase();
  return u.toString();
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " ",
};

/** Decode named and numeric HTML entities (feeds often double-encode HTML). */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m]);
}

/** JSON-LD descriptions are HTML; keep paragraph/list breaks as newlines. */
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/li|\/h[1-6]|\/div)\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m])
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** Find a schema.org JobPosting anywhere in the JSON-LD blocks (incl. @graph). */
export function findJobPosting(blocks: unknown[]): Obj | undefined {
  const stack = [...blocks];
  while (stack.length) {
    const node = stack.shift();
    if (Array.isArray(node)) {
      stack.push(...node);
    } else if (isObj(node)) {
      const type = node["@type"];
      if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return node;
      if (node["@graph"]) stack.push(node["@graph"]);
    }
  }
  return undefined;
}

const HOURS_PER_YEAR = 2080;
const UNIT_TO_ANNUAL: Record<string, number> = {
  HOUR: HOURS_PER_YEAR, DAY: 260, WEEK: 52, MONTH: 12, YEAR: 1,
};

function salaryCents(baseSalary: unknown): { min?: number; max?: number } {
  if (!isObj(baseSalary)) return {};
  const currency = str(baseSalary.currency);
  if (currency && currency !== "USD") return {};
  const value = baseSalary.value;
  const unit = (isObj(value) ? str(value.unitText) : undefined) ?? str(baseSalary.unitText) ?? "YEAR";
  const factor = UNIT_TO_ANNUAL[unit.toUpperCase()];
  if (!factor) return {};
  const toCents = (n: unknown) => {
    const num = typeof n === "string" ? Number(n.replace(/[,$]/g, "")) : n;
    return typeof num === "number" && Number.isFinite(num) && num > 0 ? Math.round(num * factor * 100) : undefined;
  };
  if (isObj(value)) {
    const single = toCents(value.value);
    return { min: toCents(value.minValue) ?? single, max: toCents(value.maxValue) ?? single };
  }
  const single = toCents(value);
  return { min: single, max: single };
}

function locationText(jobLocation: unknown): string | undefined {
  const locs = Array.isArray(jobLocation) ? jobLocation : [jobLocation];
  const parts = locs
    .map((l) => (isObj(l) && isObj(l.address) ? l.address : undefined))
    .filter((a): a is Obj => Boolean(a))
    .map((a) => {
      const city = str(a.addressLocality);
      const region = str(a.addressRegion);
      return [city, region].filter(Boolean).join(", ") || str(a.addressCountry);
    })
    .filter(Boolean);
  return parts.length ? [...new Set(parts)].join("; ") : undefined;
}

export function parseCapture(payload: CapturePayload): CaptureDraft {
  const url = canonicalJobUrl(payload.url);
  const job = findJobPosting(payload.jsonLd ?? []);

  const org = job && isObj(job.hiringOrganization) ? job.hiringOrganization : undefined;
  const remote =
    (job && /TELECOMMUTE/i.test(String(job.jobLocationType ?? ""))) ||
    /\bremote\b/i.test(payload.pageTitle ?? "");
  const { min, max } = salaryCents(job?.baseSalary);
  const posted = str(job?.datePosted);
  const postedAt = posted && !Number.isNaN(Date.parse(posted)) ? new Date(posted) : undefined;

  const descriptionText =
    (job && str(job.description) ? htmlToText(String(job.description)) : undefined) ??
    payload.text?.trim() ??
    "";

  const draft: CaptureDraft = {
    url,
    sourceJobId: url,
    title: (job && str(job.title)) ?? undefined,
    companyName: (org && str(org.name)) ?? undefined,
    location: job ? locationText(job.jobLocation) ?? (remote ? "Remote" : undefined) : undefined,
    remote,
    descriptionText,
    postedAt,
    compMinCents: min,
    compMaxCents: max,
    missing: [],
  };
  if (!draft.title) draft.missing.push("title");
  if (!draft.companyName) draft.missing.push("companyName");
  if (!draft.location) draft.missing.push("location");
  if (!draft.descriptionText) draft.missing.push("descriptionText");
  return draft;
}
