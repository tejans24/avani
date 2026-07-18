"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ruleSchema, type RuleInput } from "@/lib/validations";
import { matchRule } from "@/lib/rules";

export type RuleActionResult =
  | { ok: true; applied: number }
  | { ok: false; error: string };

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

function revalidateTransactions() {
  revalidatePath("/transactions");
  revalidatePath("/reports");
}

/**
 * Run ALL rules (priority asc, createdAt asc — matchRule's contract) against
 * every transaction that has no category yet and assign the first match.
 *
 * Two deliberate choices:
 * - NEVER touch a transaction whose categoryId is already set. Rules must not
 *   overwrite a human's categorization (or a prior rule's).
 * - Rule-applied categorization leaves status AS-IS: an UNREVIEWED row stays
 *   UNREVIEWED so the owner still eyeballs it. Only a human picking a category
 *   (setTransactionCategory / bulk) implies review.
 */
async function applyRulesToUncategorized(): Promise<number> {
  const rules = await db.categoryRule.findMany({
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  });
  if (rules.length === 0) return 0;

  const txns = await db.transaction.findMany({
    where: { categoryId: null },
    select: { id: true, description: true, merchant: true },
  });

  const idsByCategory = new Map<string, string[]>();
  for (const t of txns) {
    const categoryId = matchRule(t, rules);
    if (!categoryId) continue;
    const list = idsByCategory.get(categoryId);
    if (list) list.push(t.id);
    else idsByCategory.set(categoryId, [t.id]);
  }

  let applied = 0;
  for (const [categoryId, ids] of idsByCategory) {
    // categoryId: null repeated in the where guards against a concurrent
    // manual categorization sneaking in between the read and this write.
    const res = await db.transaction.updateMany({
      where: { id: { in: ids }, categoryId: null },
      data: { categoryId },
    });
    applied += res.count;
  }
  return applied;
}

/**
 * Create a CategoryRule from the inline "Create rule from this?" strip on
 * /transactions. When applyToExisting is true, all rules are re-run against
 * existing uncategorized transactions (see applyRulesToUncategorized for the
 * never-overwrite / keep-status contract). Returns how many transactions were
 * categorized as a result.
 */
export async function createRuleFromTransaction(
  input: RuleInput & { applyToExisting: boolean }
): Promise<RuleActionResult> {
  try {
    await requireAuth();
    const { applyToExisting, ...rest } = input;
    const parsed = ruleSchema.safeParse(rest);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    await db.categoryRule.create({ data: parsed.data });

    let applied = 0;
    if (applyToExisting) {
      applied = await applyRulesToUncategorized();
    }

    revalidateTransactions();
    return { ok: true, applied };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/**
 * Re-run every rule against all existing uncategorized transactions.
 * Same contract as createRuleFromTransaction's applyToExisting pass.
 */
export async function applyRulesToExisting(): Promise<RuleActionResult> {
  try {
    await requireAuth();
    const applied = await applyRulesToUncategorized();
    revalidateTransactions();
    return { ok: true, applied };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
