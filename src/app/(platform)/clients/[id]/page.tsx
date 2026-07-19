import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Button } from "@/components/platform/ds";
import { StatTile } from "@/components/platform/StatTile";
import { InvoiceTable, type InvoiceRow } from "@/components/platform/InvoiceTable";
import { ClientTabs, type ClientTabKey } from "@/components/platform/clients/ClientTabs";
import { PeopleTab } from "@/components/platform/clients/PeopleTab";
import { TimelineTab } from "@/components/platform/clients/TimelineTab";
import { deriveDisplayStatus } from "@/lib/invoice-status";
import { formatCents } from "@/lib/money";

export const metadata = { title: "Client — Avani" };
export const dynamic = "force-dynamic";

const TABS: ClientTabKey[] = ["overview", "people", "timeline"];

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const tab: ClientTabKey =
    searchParams.tab === "people"
      ? "people"
      : searchParams.tab === "timeline"
        ? "timeline"
        : "overview";

  const client = await db.client.findUnique({
    where: { id: params.id },
    include: {
      invoices: { orderBy: { createdAt: "desc" } },
      _count: {
        select: { contacts: { where: { archived: false } }, interactions: true },
      },
    },
  });
  if (!client) notFound();

  const rows: InvoiceRow[] = client.invoices.map((inv) => ({
    id: inv.id,
    number: inv.number,
    clientName: client.name,
    status: inv.status,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    totalCents: inv.totalCents,
  }));

  // Money summary from this client's invoices.
  let billedCents = 0; // sent + paid (excludes drafts/void)
  let collectedCents = 0; // paid
  let outstandingCents = 0; // sent, not yet paid
  let overdueCount = 0;
  for (const inv of client.invoices) {
    if (inv.status === "PAID") {
      billedCents += inv.totalCents;
      collectedCents += inv.totalCents;
    } else if (inv.status === "SENT") {
      billedCents += inv.totalCents;
      outstandingCents += inv.totalCents;
      if (deriveDisplayStatus(inv) === "OVERDUE") overdueCount++;
    }
  }

  const addressLines = [
    client.addressLine1,
    client.addressLine2,
    [client.city, client.state, client.postalCode].filter(Boolean).join(", "),
    client.country,
  ].filter(Boolean);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{client.name}</h1>
          <p className="sub">
            {client.contactName ? `${client.contactName} · ` : ""}
            {client.billingEmail}
            {client.archived ? " · archived" : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Button href={`/clients/${client.id}/edit`} variant="secondary" size="md">
            Edit client
          </Button>
          <Button href={`/invoices/new?client=${client.id}`} variant="primary" size="md">
            New invoice
          </Button>
        </div>
      </div>

      <ClientTabs
        clientId={client.id}
        active={tab}
        tabs={TABS}
        counts={{ people: client._count.contacts, timeline: client._count.interactions }}
      />

      {tab === "people" ? (
        <PeopleTab clientId={client.id} clientName={client.name} />
      ) : tab === "timeline" ? (
        <TimelineTab clientId={client.id} clientName={client.name} />
      ) : (
        <>
          <div className="stat-row">
            <StatTile label="Billed" value={formatCents(billedCents)} sublabel="Sent + paid" />
            <StatTile
              label="Outstanding"
              value={formatCents(outstandingCents)}
              sublabel={`${overdueCount} overdue`}
              tone={overdueCount > 0 ? "critical" : "default"}
            />
            <StatTile label="Collected" value={formatCents(collectedCents)} tone="positive" />
            <StatTile label="Invoices" value={String(client.invoices.length)} sublabel="All time" />
          </div>

          {addressLines.length > 0 || client.ccEmails.length > 0 || client.notes ? (
            <div className="form-card" style={{ marginBottom: 28, display: "grid", gap: 6 }}>
              {addressLines.length > 0 && (
                <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                  {addressLines.map((l, i) => (
                    <div key={i}>{l}</div>
                  ))}
                </div>
              )}
              {client.ccEmails.length > 0 && (
                <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
                  CC: {client.ccEmails.join(", ")}
                </div>
              )}
              {client.notes && (
                <div style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--text-secondary)", whiteSpace: "pre-line" }}>
                  {client.notes}
                </div>
              )}
            </div>
          ) : null}

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
              Invoices
            </h2>
            {client.invoices.length > 0 && (
              <Link
                href={`/invoices?client=${client.id}`}
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "var(--text-sm)",
                  color: "var(--color-accent)",
                  textDecoration: "none",
                }}
              >
                View in invoices list
              </Link>
            )}
          </div>

          {client.invoices.length === 0 ? (
            <div className="empty-state">
              <p className="empty-title">No invoices for {client.name} yet</p>
              <p>Create the first invoice for this client — their billing details fill in automatically.</p>
              <div className="empty-actions">
                <Button href={`/invoices/new?client=${client.id}`} variant="primary" size="sm">
                  New invoice
                </Button>
              </div>
            </div>
          ) : (
            <InvoiceTable invoices={rows} />
          )}
        </>
      )}
    </>
  );
}
