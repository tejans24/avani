/**
 * Category rule matching for imported transactions.
 *
 * Rules are evaluated in priority order (lower priority number wins, ties
 * broken by earliest createdAt) and the first matching rule's categoryId is
 * used. Matching must never throw during an import, so invalid regex
 * patterns are skipped silently.
 */

export type RuleLike = {
  id: string;
  field: "DESCRIPTION" | "MERCHANT";
  matchType: "SUBSTRING" | "REGEX";
  pattern: string;
  categoryId: string;
  priority: number;
  createdAt?: Date;
};

/**
 * Return the categoryId of the first rule that matches the transaction, or
 * null if none match. Rules are sorted by priority asc, then createdAt asc
 * (rules without createdAt sort last within a priority). Substring and regex
 * matches are both case-insensitive. MERCHANT rules skip transactions with
 * no merchant; invalid regex patterns are skipped silently.
 */
export function matchRule(
  txn: { description: string; merchant?: string | null },
  rules: RuleLike[]
): string | null {
  const sorted = [...rules].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.createdAt && b.createdAt) return a.createdAt.getTime() - b.createdAt.getTime();
    if (a.createdAt) return -1;
    if (b.createdAt) return 1;
    return 0;
  });

  for (const rule of sorted) {
    const value = rule.field === "MERCHANT" ? txn.merchant : txn.description;
    if (value === null || value === undefined) continue;

    if (rule.matchType === "SUBSTRING") {
      if (value.toLowerCase().includes(rule.pattern.toLowerCase())) {
        return rule.categoryId;
      }
    } else {
      try {
        if (new RegExp(rule.pattern, "i").test(value)) {
          return rule.categoryId;
        }
      } catch {
        // Invalid regex: skip this rule rather than failing the import.
      }
    }
  }
  return null;
}
