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

import { parsePayRange } from "@/lib/jobs/pay";

export type CapturePayload = {
  url: string;
  pageTitle?: string;
  /** Visible page text (document.body.innerText) or pasted description. */
  text?: string;
  /** Parsed contents of every <script type="application/ld+json"> on the page. */
  jsonLd?: unknown[];
  /** Page signals for pages without JSON-LD: the first <h1> and OpenGraph tags. */
  meta?: { h1?: string; ogTitle?: string; siteName?: string };
  /** A careers platform's own job object, when the page exposes one (Phenom's phApp.ddo). */
  embedded?: Record<string, unknown>;
};

type Essential = "title" | "companyName" | "location";

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
  missing: (Essential | "descriptionText")[];
  /** Fields filled from page signals rather than structured data: worth a check. */
  guessed: Essential[];
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
    guessed: [],
  };
  fillFromPageSignals(draft, payload);
  // No structured pay: most US postings state a range in the text.
  if (!draft.compMinCents && !draft.compMaxCents) {
    const pay = parsePayRange(draft.descriptionText) ?? (payload.text ? parsePayRange(payload.text) : null);
    if (pay) {
      draft.compMinCents = pay.minCents;
      draft.compMaxCents = pay.maxCents;
    }
  }
  if (!draft.title) draft.missing.push("title");
  if (!draft.companyName) draft.missing.push("companyName");
  if (!draft.location) draft.missing.push("location");
  if (!draft.descriptionText) draft.missing.push("descriptionText");
  return draft;
}

// ---- Fallbacks for pages without JSON-LD ----------------------------------

/** Separators careers sites put between job title and company in <title>. */
const TITLE_SEP = /\s+[|\-\u2013\u2014\u00b7:]\s+/;
const GENERIC_HEADING = /^(careers?|jobs?|job details?|search jobs|apply|home|join us|open positions?|job description)$/i;
const SITE_WORDS = /\b(careers?|jobs?|job board|recruiting|talent)\b/gi;
const AGGREGATOR = /^(linkedin|indeed|glassdoor|ziprecruiter|dice|monster|builtin|wellfound|usajobs)$/i;
/** Hosts that belong to the job platform, not the employer. */
const PLATFORM_HOST = /(greenhouse|lever|ashbyhq|smartrecruiters|icims|taleo|phenompeople|jobvite|workable|bamboohr|recruitee|breezy|paylocity|ultipro|ukg|adp|oraclecloud|successfactors|linkedin|indeed|glassdoor|ziprecruiter|dice)\./i;

const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

function titleParts(pageTitle: string | undefined): string[] {
  return clean(pageTitle)
    .split(TITLE_SEP)
    .map((p) => p.trim())
    .filter(Boolean);
}

function companyFromSiteName(name: string | undefined): string | undefined {
  const n = clean(clean(name).replace(SITE_WORDS, "")).replace(/^[\s\-|:]+|[\s\-|:]+$/g, "");
  return n && !AGGREGATOR.test(n) && n.length <= 60 ? n : undefined;
}

/** careers.icf.com → ICF; leidos.wd5.myworkdayjobs.com → Leidos. Platform hosts give nothing. */
export function companyFromHost(url: string): string | undefined {
  const host = new URL(url).hostname.toLowerCase();
  const labels = host.split(".");
  let label: string | undefined;
  if (host.endsWith("myworkdayjobs.com")) label = labels[0];
  else if (PLATFORM_HOST.test(host + ".")) return undefined;
  else label = labels.length >= 2 ? labels[labels.length - 2] : undefined;
  if (!label || /^(www|jobs|careers|apply|wd\d+)$/.test(label)) return undefined;
  return label.length <= 4 ? label.toUpperCase() : label[0].toUpperCase() + label.slice(1);
}

const PLATFORM_PATH = /(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|workable\.com)$/i;

/** jobs.lever.co/acme-health/… → Acme Health: the board's slug, when that's all there is. */
export function companyFromPlatformPath(url: string): string | undefined {
  const u = new URL(url);
  if (!PLATFORM_PATH.test(u.hostname)) return undefined;
  const slug = u.pathname.split("/").filter(Boolean)[0];
  if (!slug || /^(jobs?|embed|v\d)$/i.test(slug)) return undefined;
  return slug.split(/[-_]/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

const LOCATION_LINE = /^\s*(?:job\s+|work\s+)?locations?\s*[:\-]?\s*(?:\n\s*)?([^\n]{2,80})$/im;
const REMOTE_IN_TEXT = /\b(fully|100%)\s+remote\b|\bremote\s*[(,\-]?\s*(us|usa|united states)\b|\b(work\s+)?location\s*:\s*remote\b|\bthis (role|position) is (fully )?remote\b/i;

const embStr = (e: Record<string, unknown> | undefined, ...keys: string[]) => {
  for (const k of keys) {
    const v = e?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
};

/**
 * Fill what JSON-LD didn't give from what's on the page: a platform's own job
 * object, the <h1>, OpenGraph tags, the <title>, the host name and a
 * "Location:" line. Every value comes from the page; the owner checks them.
 */
function fillFromPageSignals(draft: CaptureDraft, payload: CapturePayload) {
  const emb = payload.embedded;
  const meta = payload.meta ?? {};
  const parts = titleParts(payload.pageTitle);
  const ogParts = titleParts(meta.ogTitle);
  const h1 = clean(meta.h1);
  const guess = (field: Essential, value: string | undefined) => {
    if (draft[field] || !value) return;
    draft[field] = value;
    draft.guessed.push(field);
  };

  // The company as the page names it, or as its address does. Known first, so
  // "Acme Health - Platform Engineer" splits the right way round.
  const known = [embStr(emb, "companyName", "company", "hiringOrganization"), companyFromSiteName(meta.siteName), companyFromHost(draft.url) ?? companyFromPlatformPath(draft.url)];
  const key = (v: string) => v.toLowerCase().replace(SITE_WORDS, "").replace(/[^a-z0-9]/g, "");
  const isCompany = (part: string) => {
    const k = key(part);
    return k.length >= 2 && known.some((c) => c && key(c).length >= 2 && (k.includes(key(c)) || key(c).includes(k)));
  };
  const usable = (part: string | undefined) => part && !GENERIC_HEADING.test(part) && !AGGREGATOR.test(part) ? part : undefined;
  const allParts = [...ogParts, ...parts];

  // "Senior Cloud Architect (Remote)": the work mode belongs in location, not the title.
  const rawTitle = [draft.title, embStr(emb, "title", "jobTitle"), h1, payload.pageTitle].join(" ");
  const tidy = (t: string | undefined) => t?.replace(/\s*(\((remote|hybrid)[^)]*\)|-\s*(remote|hybrid))\s*$/i, "").trim() || undefined;
  guess("title", tidy(embStr(emb, "title", "jobTitle")));
  guess("title", h1.length <= 150 && !isCompany(h1) ? tidy(usable(h1)) : undefined);
  guess("title", tidy(ogParts.find((p) => usable(p) && !isCompany(p))));
  guess("title", tidy(parts.find((p) => usable(p) && !isCompany(p))));

  guess("companyName", known[0]);
  guess("companyName", known[1]);
  guess("companyName", companyFromSiteName(allParts.find(isCompany)));
  const title = draft.title?.toLowerCase() ?? "";
  guess("companyName", allParts.map((p) => (title.startsWith(p.toLowerCase().slice(0, 20)) ? undefined : companyFromSiteName(usable(p)))).find(Boolean));
  guess("companyName", known[2]);

  const embRemote = /remote/i.test(embStr(emb, "workplaceType", "remote", "type", "location") ?? "");
  const embLocation =
    embStr(emb, "location", "cityStateCountry", "cityState") ??
    ([embStr(emb, "city"), embStr(emb, "state")].filter(Boolean).join(", ") || undefined);
  const titleSaysRemote = /\bremote\b/i.test(rawTitle);
  const text = payload.text ?? "";
  const line = text.match(LOCATION_LINE)?.[1]?.trim();
  if (titleSaysRemote || embRemote || REMOTE_IN_TEXT.test(text)) {
    draft.remote = true;
    guess("location", embLocation && /remote/i.test(embLocation) ? embLocation : "Remote");
  }
  guess("location", embLocation);
  guess("location", line);

  if (!draft.descriptionText || draft.descriptionText === text.trim()) {
    const desc = embStr(emb, "description", "jobDescription");
    if (desc) draft.descriptionText = htmlToText(desc);
  }
  if (!draft.postedAt) {
    const posted = embStr(emb, "postedDate", "datePosted", "dateCreated");
    if (posted && !Number.isNaN(Date.parse(posted))) draft.postedAt = new Date(posted);
  }
}
