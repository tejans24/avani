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
  /** The application form's questions, when the page includes the form (Greenhouse, Lever, Ashby do). */
  questions: string[];
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

export function parseCapture(input: CapturePayload): CaptureDraft {
  // Job pages often end with the application form: keep it out of the description and the guesses.
  const { body, form } = splitApplicationForm(input.text ?? "");
  const payload: CapturePayload = { ...input, text: input.text === undefined ? undefined : body };
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
    questions: extractFormQuestions(form),
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

/** "Washington, DC", "Austin, Texas", "Remote", "Hybrid - Reston, VA", "Remote, United States". */
const PLACE = /^(?:(?:remote|hybrid|on-?site)\b.{0,40}|[A-Z][A-Za-z.' -]{1,40},\s*(?:[A-Z]{2}\b|[A-Z][a-z]+(?: [A-Z][a-z]+)*)(?:,\s*[A-Za-z ]+)?)$/;
const FORM_LABEL = /[*]|^\(|select\.\.\.|locate me/i;

/** Find a board slug in the page as written: "accenturefederalservices" → "Accenture Federal Services". */
export function companyInText(slugName: string | undefined, text: string): string | undefined {
  const target = slugName?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!target || target.length < 4) return undefined;
  for (const m of text.matchAll(/\b[A-Z][\w&.'-]*(?:\s+(?:[A-Z&][\w&.'-]*|of|and|for|the))*/g)) {
    // "Join Accenture Federal Services": try every run of words, not just from the first.
    const words = m[0].split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      for (let n = words.length; n > i; n--) {
        const candidate = words.slice(i, n).join(" ");
        if (candidate.toLowerCase().replace(/[^a-z0-9]/g, "") === target) return candidate;
      }
    }
  }
  return undefined;
}

// ---- The application form at the bottom of a job page ----------------------

const FORM_START = [/^\s*apply for this job\s*$/im, /^\s*\*?\s*indicates a required field\s*$/im, /^\s*first name\s*\*\s*$/im];

/** The job text above the application form, and the form below it. */
export function splitApplicationForm(text: string): { body: string; form: string } {
  const starts = FORM_START.map((re) => text.search(re)).filter((i) => i > 200);
  if (!starts.length) return { body: text, form: "" };
  const at = Math.min(...starts);
  return { body: text.slice(0, at).trim(), form: text.slice(at) };
}

const FORM_NOISE = /^(\*|select\.\.\.|attach|dropbox|google drive|enter manually|locate me|add another|submit application|powered by|apply for this job|indicates a required field|accepted file types.*)$/i;
const UPLOAD_FIELD = /^(resume|cv|resume\/cv|cover letter|attachments?)\b/i;

/** The form's questions: required fields (*), questions (?) and dropdowns (followed by "Select..."). */
export function extractFormQuestions(form: string): string[] {
  const lines = form.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: string[] = [];
  lines.forEach((line, i) => {
    if (FORM_NOISE.test(line) || line.length > 250) return;
    const dropdown = /^select\.\.\.$/i.test(lines[i + 1] ?? "");
    if (!/[*?]\s*$/.test(line) && !dropdown) return;
    const q = line.replace(/\s*\*+\s*$/, "").trim();
    if (q.length < 2 || UPLOAD_FIELD.test(q) || out.some((o) => o.toLowerCase() === q.toLowerCase())) return;
    out.push(q);
  });
  return out.slice(0, 40);
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
  // Greenhouse: "Job Application for Enterprise Architect at Accenture Federal Services".
  const gh = clean(payload.pageTitle).match(/^job application for (.+?) at (.+)$/i);
  guess("title", tidy(embStr(emb, "title", "jobTitle")));
  guess("title", gh ? tidy(gh[1]) : undefined);
  // Pasted text has no page title or heading: its first line is the title when it reads like one.
  const firstLine = (payload.text ?? "").split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  if (!payload.pageTitle && !h1 && firstLine && firstLine.length <= 100 && !PLACE.test(firstLine) && !/[.!?:]$/.test(firstLine)) {
    guess("title", tidy(usable(firstLine)));
  }
  guess("companyName", gh ? gh[2].trim() : undefined);
  guess("title", h1.length <= 150 && !isCompany(h1) ? tidy(usable(h1)) : undefined);
  guess("title", tidy(ogParts.find((p) => usable(p) && !isCompany(p))));
  guess("title", tidy(parts.find((p) => usable(p) && !isCompany(p))));

  guess("companyName", known[0]);
  guess("companyName", known[1]);
  guess("companyName", companyFromSiteName(allParts.find(isCompany)));
  const title = draft.title?.toLowerCase() ?? "";
  guess("companyName", allParts.map((p) => (title.startsWith(p.toLowerCase().slice(0, 20)) ? undefined : companyFromSiteName(usable(p)))).find(Boolean));
  // A board slug ("accenturefederalservices") as the page spells it ("Accenture Federal Services").
  guess("companyName", companyInText(known[2], payload.text ?? ""));
  guess("companyName", known[2]);

  const embRemote = /remote/i.test(embStr(emb, "workplaceType", "remote", "type", "location") ?? "");
  const embLocation =
    embStr(emb, "location", "cityStateCountry", "cityState") ??
    ([embStr(emb, "city"), embStr(emb, "state")].filter(Boolean).join(", ") || undefined);
  const titleSaysRemote = /\bremote\b/i.test(rawTitle);
  const text = payload.text ?? "";
  // The line under the title is usually the location ("Enterprise Architect / Washington, DC / Apply").
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const titleAt = draft.title ? lines.slice(0, 15).findIndex((l) => l.toLowerCase() === draft.title!.toLowerCase()) : -1;
  // No known title (pasted text): a place-shaped line near the top.
  const underTitle = (titleAt >= 0 ? lines.slice(titleAt + 1, titleAt + 4) : lines.slice(0, 6)).find((l) => PLACE.test(l));
  // "Location: Baltimore, MD", but never a form label ("Location (City)*").
  const line = [...text.matchAll(new RegExp(LOCATION_LINE.source, "gim"))].map((m) => m[1].trim()).find((v) => !FORM_LABEL.test(v));
  if (titleSaysRemote || embRemote || REMOTE_IN_TEXT.test(text)) {
    draft.remote = true;
    guess("location", embLocation && /remote/i.test(embLocation) ? embLocation : "Remote");
  }
  guess("location", embLocation);
  guess("location", underTitle);
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
