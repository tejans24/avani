/**
 * Benefits at a glance — pattern extraction from posting text, so the jobs
 * table can show what an employer offers without opening every posting.
 *
 * Pure functions (unit-tested). Each benefit has a detection pattern and an
 * optional value pattern whose first capture group becomes the badge value
 * ("6%", "20 days"). The matched sentence is kept as evidence.
 *
 * Benefits are usually company-wide, so the UI merges three layers, highest
 * priority first: owner-entered (JobCompany.benefits) → this posting →
 * other postings from the same company. See mergeBenefits.
 */

export type BenefitKey =
  | "health"
  | "dentalVision"
  | "hsa"
  | "retirement"
  | "pension"
  | "pto"
  | "holidays"
  | "parentalLeave"
  | "flexibleSchedule"
  | "remoteStipend"
  | "learning"
  | "bonus"
  | "equity";

type BenefitDef = {
  key: BenefitKey;
  label: string;
  detect: RegExp;
  /** First capture group → display value. */
  value?: { pattern: RegExp; format: (m: string) => string };
};

export const BENEFITS: BenefitDef[] = [
  {
    key: "health",
    label: "Health",
    detect: /\b(medical|health)\b[^.]{0,40}\b(insurance|coverage|plans?|benefits|premiums?)\b/i,
    value: {
      pattern: /\b(\d{2,3})\s?% (?:of )?(?:employee |your )?(?:medical|health)?\s?(?:insurance )?premiums?\b/i,
      format: (m) => `${m}% premiums paid`,
    },
  },
  { key: "dentalVision", label: "Dental/Vision", detect: /\b(dental|vision)\b/i },
  {
    key: "hsa",
    label: "HSA",
    detect: /\b(hsa|health savings account)\b/i,
  },
  {
    key: "retirement",
    label: "401(k)",
    detect: /\b(401\s?\(?k\)?|403\s?\(?b\)?|retirement (plan|savings))\b/i,
    value: {
      pattern: /\b(\d{1,2}(?:\.\d)?)\s?% (?:401\s?\(?k\)? )?(?:employer )?match/i,
      format: (m) => `${m}% match`,
    },
  },
  { key: "pension", label: "Pension", detect: /\b(pension|defined benefit)\b/i },
  {
    key: "pto",
    label: "PTO",
    detect: /\b(pto|paid time off|vacation|unlimited (pto|time off|vacation))\b/i,
    value: {
      pattern: /\b(unlimited|\d{1,2}\+? days?)(?: of)? (?:pto|paid time off|vacation)/i,
      format: (m) => (/unlimited/i.test(m) ? "Unlimited" : m.replace(/days?/i, "days")),
    },
  },
  {
    key: "holidays",
    label: "Holidays",
    detect: /\b(paid|federal|company) holidays\b/i,
    value: {
      pattern: /\b(\d{1,2}) (?:paid |federal |company )*holidays\b/i,
      format: (m) => `${m} holidays`,
    },
  },
  {
    key: "parentalLeave",
    label: "Parental leave",
    detect: /\b(parental|maternity|paternity|family) leave\b/i,
    value: {
      pattern: /\b(\d{1,2}) weeks?(?: of)?(?: fully)?(?: paid)? (?:parental|maternity|paternity|family) leave/i,
      format: (m) => `${m} weeks`,
    },
  },
  {
    key: "flexibleSchedule",
    label: "Flexible schedule",
    detect: /\b(9\/80|4\/10|flexible (work )?(schedule|hours)|four[- ]day work ?week|4[- ]day work ?week)\b/i,
    value: {
      pattern: /\b(9\/80|4\/10|four[- ]day|4[- ]day)\b/i,
      format: (m) => (/^(four|4)/i.test(m) ? "4-day week" : m),
    },
  },
  {
    key: "remoteStipend",
    label: "Home-office stipend",
    detect: /\b(home[- ]office|remote work|work[- ]from[- ]home|wfh|internet|equipment) (stipend|allowance|reimbursement)\b/i,
  },
  {
    key: "learning",
    label: "Learning budget",
    detect: /\b(tuition (assistance|reimbursement)|learning (budget|stipend)|professional development (budget|stipend|allowance)|certification reimbursement|education assistance)\b/i,
    value: {
      pattern: /(\$\d{1,3}(?:,\d{3})*(?:k)?)(?: per year| annually| annual| a year)?[^.]{0,40}\b(?:tuition|learning|professional development|education|certification)/i,
      format: (m) => m,
    },
  },
  {
    key: "bonus",
    label: "Bonus",
    detect: /\b(annual|performance|signing|sign-on) bonus\b|\bbonus (eligible|eligibility|program)\b/i,
  },
  {
    key: "equity",
    label: "Equity",
    detect: /\b(equity|stock options|rsus?|espp|employee stock)\b/i,
  },
];

export type ExtractedBenefit = {
  key: BenefitKey;
  label: string;
  value?: string;
  /** The words the benefit was found in: the sentence, or a window of a long one. */
  evidence: string;
};

/** Split into rough sentences / list items for evidence capture. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+|•/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The words around a match: whole sentence if short, else a window. */
function around(sentence: string, re: RegExp): string {
  if (sentence.length <= 140) return sentence;
  const m = re.exec(sentence);
  if (!m) return sentence.slice(0, 140) + "…";
  const start = Math.max(0, m.index - 50);
  const end = Math.min(sentence.length, m.index + m[0].length + 50);
  return (start > 0 ? "…" : "") + sentence.slice(start, end).trim() + (end < sentence.length ? "…" : "");
}

export function extractBenefits(text: string): ExtractedBenefit[] {
  const parts = sentences(text);
  const out: ExtractedBenefit[] = [];
  for (const def of BENEFITS) {
    const hit = parts.find((s) => def.detect.test(s));
    if (!hit) continue;
    let value: string | undefined;
    if (def.value) {
      for (const s of parts) {
        const m = s.match(def.value.pattern);
        if (m?.[1]) {
          value = def.value.format(m[1]);
          break;
        }
      }
    }
    out.push({ key: def.key, label: def.label, value, evidence: around(hit, def.detect) });
  }
  return out;
}

export type BenefitSource = "you" | "posted" | "company-wide";
export type MergedBenefit = ExtractedBenefit & { source: BenefitSource };

/**
 * Merge for display: owner-entered beats this posting beats other postings
 * at the same company. Output follows BENEFITS order.
 */
export function mergeBenefits(input: {
  owner: Partial<Record<BenefitKey, { value?: string; note?: string }>>;
  posting: ExtractedBenefit[];
  company: ExtractedBenefit[];
}): MergedBenefit[] {
  const byKey = new Map<BenefitKey, MergedBenefit>();
  for (const b of input.company) {
    const prev = byKey.get(b.key);
    // Among sibling postings, prefer one that carries a value.
    if (!prev || (!prev.value && b.value)) byKey.set(b.key, { ...b, source: "company-wide" });
  }
  for (const b of input.posting) {
    const prev = byKey.get(b.key);
    byKey.set(b.key, { ...b, value: b.value ?? prev?.value, source: "posted" });
  }
  for (const [key, entry] of Object.entries(input.owner) as [BenefitKey, { value?: string; note?: string }][]) {
    const def = BENEFITS.find((d) => d.key === key);
    if (!def || !entry) continue;
    byKey.set(key, {
      key,
      label: def.label,
      value: entry.value ?? byKey.get(key)?.value,
      evidence: entry.note ?? "Entered by you",
      source: "you",
    });
  }
  return BENEFITS.map((d) => byKey.get(d.key)).filter((b): b is MergedBenefit => Boolean(b));
}
