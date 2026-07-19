import Link from "next/link";
import { db } from "@/lib/db";
import { Badge, Button } from "@/components/platform/ds";

export const metadata = { title: "Clients — Avani" };
export const dynamic = "force-dynamic";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: { archived?: string };
}) {
  const showArchived = searchParams.archived === "1";

  const clients = await db.client.findMany({
    where: { archived: showArchived },
    orderBy: { name: "asc" },
    include: { _count: { select: { invoices: true } } },
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Clients</h1>
          <p className="sub">Who you bill, and how to reach them.</p>
        </div>
        <Button href="/clients/new" variant="primary" size="md">
          New client
        </Button>
      </div>

      <div className="filter-tabs">
        <Link href="/clients" data-active={!showArchived || undefined}>
          Active
        </Link>
        <Link href="/clients?archived=1" data-active={showArchived || undefined}>
          Archived
        </Link>
      </div>

      {clients.length === 0 ? (
        showArchived ? (
          <div className="empty-state">No archived clients.</div>
        ) : (
          <div className="empty-state">
            <p className="empty-title">No clients yet</p>
            <p>Add your first client to get started — invoices pull their billing details automatically.</p>
            <div className="empty-actions">
              <Button href="/clients/new" variant="primary" size="sm">
                New client
              </Button>
            </div>
          </div>
        )
      ) : (
        <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              <th>Billing email</th>
              <th className="num">Invoices</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.id}>
                <td>
                  <Link href={`/clients/${client.id}`}>{client.name}</Link>
                </td>
                <td>{client.contactName ?? "—"}</td>
                <td>{client.billingEmail}</td>
                <td className="num">{client._count.invoices}</td>
                <td>
                  {client.archived ? (
                    <Badge tone="caution">Archived</Badge>
                  ) : (
                    <Badge tone="brand">Active</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </>
  );
}
