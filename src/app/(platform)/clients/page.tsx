import Link from "next/link";
import { db } from "@/lib/db";
import { Badge, Button } from "@/components/platform/ds";
import { StatTile } from "@/components/platform/StatTile";
import { formatCents } from "@/lib/money";
import { formatDateLong } from "@/lib/dates";
import { CLIENT_STAGES, type ClientStage } from "@/lib/validations";
import { STAGE_LABEL, weightedPipelineCents, pipelineValueCents } from "@/lib/bd-playbook";

export const metadata = { title: "Clients — Avani" };
export const dynamic = "force-dynamic";

const STAGE_TONE: Record<ClientStage, string> = {
  LEAD: "accent",
  PROSPECT: "caution",
  ACTIVE: "positive",
  PAST: "neutral",
};

function isStage(v: string | undefined): v is ClientStage {
  return !!v && (CLIENT_STAGES as readonly string[]).includes(v);
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: { archived?: string; stage?: string };
}) {
  const showArchived = searchParams.archived === "1";
  const stageFilter = isStage(searchParams.stage) ? searchParams.stage : null;

  const [clients, openClients] = await Promise.all([
    db.client.findMany({
      where: { archived: showArchived, ...(stageFilter ? { stage: stageFilter } : {}) },
      orderBy: { name: "asc" },
      include: { _count: { select: { invoices: true } } },
    }),
    // Pipeline reflects ALL open deals, independent of the current filter.
    db.client.findMany({
      where: { archived: false, stage: { in: ["LEAD", "PROSPECT"] } },
      select: { stage: true, dealValueCents: true },
    }),
  ]);

  const weighted = weightedPipelineCents(openClients);
  const raw = pipelineValueCents(openClients);
  const openWithValue = openClients.filter((c) => (c.dealValueCents ?? 0) > 0).length;

  const stageHref = (s: ClientStage | null) =>
    s ? `/clients?stage=${s}` : "/clients";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Clients</h1>
          <p className="sub">Who you bill, who you're chasing, and how to reach them.</p>
        </div>
        <Button href="/clients/new" variant="primary" size="md">
          New client
        </Button>
      </div>

      {openWithValue > 0 && (
        <div className="stat-row">
          <StatTile
            label="Pipeline (weighted)"
            value={formatCents(weighted)}
            sublabel={`${formatCents(raw)} unweighted`}
          />
          <StatTile
            label="Open deals"
            value={String(openWithValue)}
            sublabel="Leads + prospects with a value"
          />
        </div>
      )}

      <div className="filter-tabs">
        <Link href="/clients" data-active={(!showArchived && !stageFilter) || undefined}>
          Active
        </Link>
        {CLIENT_STAGES.map((s) => (
          <Link
            key={s}
            href={stageHref(s)}
            data-active={(!showArchived && stageFilter === s) || undefined}
          >
            {STAGE_LABEL[s]}
          </Link>
        ))}
        <Link href="/clients?archived=1" data-active={showArchived || undefined}>
          Archived
        </Link>
      </div>

      {clients.length === 0 ? (
        showArchived ? (
          <div className="empty-state">No archived clients.</div>
        ) : stageFilter ? (
          <div className="empty-state">No {STAGE_LABEL[stageFilter].toLowerCase()} clients.</div>
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
                <th>Stage</th>
                <th>Next step</th>
                <th>Billing email</th>
                <th className="num">Invoices</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id}>
                  <td>
                    <Link href={`/clients/${client.id}`}>{client.name}</Link>
                  </td>
                  <td>
                    <Badge tone={STAGE_TONE[client.stage]}>{STAGE_LABEL[client.stage]}</Badge>
                  </td>
                  <td>
                    {client.nextActionNote ? (
                      <span style={{ fontSize: "var(--text-sm)" }}>
                        {client.nextActionNote}
                        {client.nextActionDueDate ? (
                          <span style={{ color: "var(--text-muted)" }}>
                            {" "}
                            · {formatDateLong(client.nextActionDueDate)}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </td>
                  <td>{client.billingEmail}</td>
                  <td className="num">{client._count.invoices}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
