import Link from "next/link";
import { db } from "@/lib/db";
import { todayUtc } from "@/lib/dates";
import { Button } from "@/components/platform/ds";
import { InvoiceTable, type InvoiceRow } from "@/components/platform/InvoiceTable";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Invoices — Avani" };
export const dynamic = "force-dynamic";

const FILTERS = ["all", "draft", "sent", "overdue", "paid", "void"] as const;
type Filter = (typeof FILTERS)[number];

function whereFor(filter: Filter): Prisma.InvoiceWhereInput {
  const today = todayUtc();
  switch (filter) {
    case "draft":
      return { status: "DRAFT" };
    case "sent":
      return { status: "SENT" };
    case "overdue":
      return { status: "SENT", dueDate: { lt: today } };
    case "paid":
      return { status: "PAID" };
    case "void":
      return { status: "VOID" };
    default:
      return {};
  }
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const filter: Filter = FILTERS.includes(searchParams.status as Filter)
    ? (searchParams.status as Filter)
    : "all";

  const invoices = await db.invoice.findMany({
    where: whereFor(filter),
    orderBy: { createdAt: "desc" },
    include: { client: { select: { name: true } } },
  });

  const rows: InvoiceRow[] = invoices.map((inv) => ({
    id: inv.id,
    number: inv.number,
    clientName: inv.client.name,
    status: inv.status,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    totalCents: inv.totalCents,
  }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Invoices</h1>
          <p className="sub">Create, send, and track invoices.</p>
        </div>
        <Button href="/invoices/new" variant="primary" size="md">
          New invoice
        </Button>
      </div>

      <div className="filter-tabs">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "all" ? "/invoices" : `/invoices?status=${f}`}
            data-active={f === filter || undefined}
          >
            {f[0].toUpperCase() + f.slice(1)}
          </Link>
        ))}
      </div>

      <InvoiceTable invoices={rows} />
    </>
  );
}
