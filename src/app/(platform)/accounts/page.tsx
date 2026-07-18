import Link from "next/link";
import { db } from "@/lib/db";
import { Button } from "@/components/platform/ds";
import { AccountsTable } from "@/components/platform/accounts/AccountsTable";
import { SyncNowButton } from "@/components/platform/accounts/SyncNowButton";

export const metadata = { title: "Accounts — Avani" };
export const dynamic = "force-dynamic";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: { archived?: string };
}) {
  const showArchived = searchParams.archived === "1";

  const accounts = await db.financialAccount.findMany({
    where: { archived: showArchived },
    orderBy: { name: "asc" },
    include: { _count: { select: { transactions: true } } },
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Accounts</h1>
          <p className="sub">Bank and card accounts feeding your transactions.</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <SyncNowButton />
          <Button href="/accounts/new" variant="primary" size="md">
            Add account
          </Button>
        </div>
      </div>

      <div className="filter-tabs">
        <Link href="/accounts" data-active={!showArchived || undefined}>
          Active
        </Link>
        <Link href="/accounts?archived=1" data-active={showArchived || undefined}>
          Archived
        </Link>
      </div>

      {accounts.length === 0 ? (
        showArchived ? (
          <div className="empty-state">No archived accounts.</div>
        ) : (
          <div className="empty-state">
            <p className="empty-title">No accounts yet</p>
            <p>Connect a bank or card account to start importing transactions.</p>
            <div className="empty-actions">
              <Button href="/accounts/new" variant="primary" size="sm">
                Add account
              </Button>
            </div>
          </div>
        )
      ) : (
        <AccountsTable
          accounts={accounts.map((a) => ({
            id: a.id,
            name: a.name,
            kind: a.kind,
            institution: a.institution,
            mask: a.mask,
            source: a.source,
            archived: a.archived,
            transactionCount: a._count.transactions,
          }))}
        />
      )}
    </>
  );
}
