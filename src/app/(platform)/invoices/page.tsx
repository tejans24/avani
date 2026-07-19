import Link from "next/link";
import { db } from "@/lib/db";
import { todayUtc } from "@/lib/dates";
import { Button } from "@/components/platform/ds";
import { InvoiceTable, type InvoiceRow } from "@/components/platform/InvoiceTable";
import { InvoiceClientFilter } from "@/components/platform/InvoiceClientFilter";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Invoices — Avani" };
export const dynamic = "force-dynamic";

const FILTERS = ["all", "draft", "sent", "overdue", "paid", "void"] as const;
type Filter = (typeof FILTERS)[number];

function whereForStatus(filter: Filter): Prisma.InvoiceWhereInput {
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

/** Build a filter-tab href that preserves the active client filter. */
function statusHref(f: Filter, clientId: string): string {
  const params = new URLSearchParams();
  if (f !== "all") params.set("status", f);
  if (clientId) params.set("client", clientId);
  const qs = params.toString();
  return qs ? `/invoices?${qs}` : "/invoices";
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: { status?: string; client?: string };
}) {
  const filter: Filter = FILTERS.includes(searchParams.status as Filter)
    ? (searchParams.status as Filter)
    : "all";
  const clientId = searchParams.client ?? "";

  const [clients, invoices] = await Promise.all([
    db.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.invoice.findMany({
      where: {
        ...whereForStatus(filter),
        ...(clientId ? { clientId } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { client: { select: { name: true } } },
    }),
  ]);

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

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 20,
        }}
      >
        <div className="filter-tabs" style={{ marginBottom: 0 }}>
          {FILTERS.map((f) => (
            <Link key={f} href={statusHref(f, clientId)} data-active={f === filter || undefined}>
              {f[0].toUpperCase() + f.slice(1)}
            </Link>
          ))}
        </div>
        <InvoiceClientFilter clients={clients} selected={clientId} status={filter} />
      </div>

      <InvoiceTable invoices={rows} />
    </>
  );
}
