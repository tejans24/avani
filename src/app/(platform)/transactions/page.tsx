import Link from "next/link";
import { db } from "@/lib/db";
import { dateToIso } from "@/lib/dates";
import { Badge } from "@/components/platform/ds";
import {
  TransactionFilters,
  type FilterValues,
} from "@/components/platform/transactions/TransactionFilters";
import {
  TransactionsTable,
  type TxnRow,
} from "@/components/platform/transactions/TransactionsTable";
import { MatchSuggestionBanner } from "@/components/platform/transactions/MatchSuggestionBanner";
import { SyncNowButton } from "@/components/platform/accounts/SyncNowButton";
import { Button } from "@/components/platform/ds";
import { suggestionsForTransactions } from "@/lib/match-data";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Transactions — Avani" };
export const dynamic = "force-dynamic";

const PER_PAGE = 200;

const STATUS_MAP: Record<string, "UNREVIEWED" | "REVIEWED" | "EXCLUDED"> = {
  unreviewed: "UNREVIEWED",
  reviewed: "REVIEWED",
  excluded: "EXCLUDED",
};

type SearchParams = {
  account?: string;
  category?: string; // category id or "none" (uncategorized)
  status?: string; // unreviewed | reviewed | excluded
  month?: string; // YYYY-MM
  q?: string;
  page?: string; // 1-based
};

function buildWhere(sp: SearchParams): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = {};
  if (sp.account) where.accountId = sp.account;
  if (sp.category === "none") where.categoryId = null;
  else if (sp.category) where.categoryId = sp.category;
  const status = STATUS_MAP[sp.status ?? ""];
  if (status) where.status = status;
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(sp.month ?? "");
  if (monthMatch) {
    const year = parseInt(monthMatch[1], 10);
    const month = parseInt(monthMatch[2], 10);
    if (month >= 1 && month <= 12) {
      where.postedAt = {
        gte: new Date(Date.UTC(year, month - 1, 1)),
        lt: new Date(Date.UTC(year, month, 1)),
      };
    }
  }
  const q = (sp.q ?? "").trim();
  if (q) {
    where.OR = [
      { description: { contains: q, mode: "insensitive" } },
      { merchant: { contains: q, mode: "insensitive" } },
    ];
  }
  return where;
}

function pageHref(sp: SearchParams, page: number): string {
  const params = new URLSearchParams();
  if (sp.account) params.set("account", sp.account);
  if (sp.category) params.set("category", sp.category);
  if (sp.status) params.set("status", sp.status);
  if (sp.month) params.set("month", sp.month);
  if (sp.q) params.set("q", sp.q);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/transactions?${qs}` : "/transactions";
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const where = buildWhere(searchParams);
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);

  const [total, txns, unreviewedCount, uncategorizedCount, accounts, categories] =
    await Promise.all([
      db.transaction.count({ where }),
      db.transaction.findMany({
        where,
        orderBy: [{ postedAt: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * PER_PAGE,
        take: PER_PAGE,
        include: { account: { select: { name: true } } },
      }),
      // Both counts are app-wide on purpose (independent of the current filter).
      db.transaction.count({ where: { status: "UNREVIEWED" } }),
      db.transaction.count({ where: { categoryId: null } }),
      db.financialAccount.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      db.category.findMany({
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true },
      }),
    ]);

  // Deposit→invoice suggestions for the transactions on this page (top
  // candidate per deposit, rendered as banners above the table).
  const suggestions = await suggestionsForTransactions(txns.map((t) => t.id));
  const suggestedRows = txns
    .filter((t) => suggestions.has(t.id))
    .map((t) => ({
      transactionId: t.id,
      amountCents: t.amountCents,
      postedAtIso: dateToIso(t.postedAt),
      candidate: suggestions.get(t.id)![0],
    }));

  const rows: TxnRow[] = txns.map((t) => ({
    id: t.id,
    postedAt: dateToIso(t.postedAt),
    accountName: t.account.name,
    description: t.description,
    merchant: t.merchant,
    amountCents: t.amountCents,
    categoryId: t.categoryId,
    status: t.status,
  }));

  const filterValues: FilterValues = {
    account: searchParams.account ?? "",
    category: searchParams.category ?? "",
    status: STATUS_MAP[searchParams.status ?? ""] ? searchParams.status! : "",
    month: searchParams.month ?? "",
    q: searchParams.q ?? "",
  };

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const hasActiveFilter = Boolean(
    searchParams.account ||
      searchParams.category ||
      searchParams.status ||
      searchParams.month ||
      (searchParams.q ?? "").trim()
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Transactions</h1>
          <p className="sub">
            {total} transaction{total === 1 ? "" : "s"} for the current filter.
          </p>
        </div>
        {unreviewedCount > 0 && (
          <Link href="/transactions?status=unreviewed" style={{ textDecoration: "none" }}>
            <Badge tone="caution">{unreviewedCount} unreviewed</Badge>
          </Link>
        )}
      </div>

      <TransactionFilters accounts={accounts} categories={categories} values={filterValues} />

      {suggestedRows.length > 0 && (
        <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
          {suggestedRows.map((s) => (
            <MatchSuggestionBanner
              key={s.transactionId}
              transactionId={s.transactionId}
              candidate={s.candidate}
              amountCents={s.amountCents}
              postedAtIso={s.postedAtIso}
            />
          ))}
        </div>
      )}

      {total === 0 && !hasActiveFilter ? (
        <div className="empty-state">
          <p className="empty-title">No transactions yet</p>
          <p>
            Pull activity from Mercury or upload a CSV export from your bank or
            card — categorized transactions feed the P&amp;L and tax estimates.
          </p>
          <div className="empty-actions">
            <SyncNowButton />
            <Button
              href={accounts.length > 0 ? `/accounts/${accounts[0].id}/import` : "/accounts/new"}
              variant="secondary"
              size="sm"
            >
              Import CSV
            </Button>
          </div>
        </div>
      ) : (
        <TransactionsTable
          rows={rows}
          categories={categories}
          uncategorizedCount={uncategorizedCount}
        />
      )}

      {(page > 1 || total > page * PER_PAGE) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginTop: 16,
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-sm)",
          }}
        >
          {page > 1 && <Link href={pageHref(searchParams, page - 1)}>← Prev</Link>}
          <span style={{ color: "var(--text-muted)" }}>
            Page {page} of {totalPages}
          </span>
          {total > page * PER_PAGE && (
            <Link href={pageHref(searchParams, page + 1)}>Next →</Link>
          )}
        </div>
      )}
    </>
  );
}
