import Link from "next/link";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { todayUtc } from "@/lib/dates";
import { Button } from "@/components/platform/ds";
import { StatTile } from "@/components/platform/StatTile";
import { InvoiceTable, type InvoiceRow } from "@/components/platform/InvoiceTable";
import { HealthCard } from "@/components/platform/HealthCard";

export const metadata = { title: "Dashboard — Avani" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const today = todayUtc();
  const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));

  const [outstanding, overdue, drafts, paidYtd, recent] = await Promise.all([
    db.invoice.aggregate({
      where: { status: "SENT" },
      _sum: { totalCents: true },
      _count: true,
    }),
    db.invoice.aggregate({
      where: { status: "SENT", dueDate: { lt: today } },
      _sum: { totalCents: true },
      _count: true,
    }),
    db.invoice.count({ where: { status: "DRAFT" } }),
    db.invoice.aggregate({
      where: { status: "PAID", paidAt: { gte: yearStart } },
      _sum: { totalCents: true },
    }),
    db.invoice.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { client: { select: { name: true } } },
    }),
  ]);

  const rows: InvoiceRow[] = recent.map((inv) => ({
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
          <h1>Dashboard</h1>
          <p className="sub">Your invoicing at a glance.</p>
        </div>
        <Button href="/invoices/new" variant="primary" size="md">
          New invoice
        </Button>
      </div>

      <HealthCard />

      <div className="stat-row">
        <StatTile
          label="Outstanding"
          value={formatCents(outstanding._sum.totalCents ?? 0)}
          sublabel={`${outstanding._count} sent invoice${outstanding._count === 1 ? "" : "s"}`}
        />
        <StatTile
          label="Overdue"
          value={formatCents(overdue._sum.totalCents ?? 0)}
          sublabel={`${overdue._count} invoice${overdue._count === 1 ? "" : "s"} past due`}
          tone={overdue._count > 0 ? "critical" : "default"}
        />
        <StatTile
          label="Collected this year"
          value={formatCents(paidYtd._sum.totalCents ?? 0)}
          tone="positive"
        />
        <StatTile label="Drafts" value={String(drafts)} sublabel="awaiting review" />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-xl)",
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          Recent invoices
        </h2>
        <Link
          href="/invoices"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-sm)",
            color: "var(--color-accent)",
            textDecoration: "none",
          }}
        >
          View all
        </Link>
      </div>
      <InvoiceTable invoices={rows} />
    </>
  );
}
