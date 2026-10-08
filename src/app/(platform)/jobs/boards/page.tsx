import Link from "next/link";
import { db } from "@/lib/db";
import { Badge, Eyebrow } from "@/components/platform/ds";
import { AddBoardForm, BoardRowActions } from "@/components/platform/jobs/BoardControls";
import { SOURCE_LABEL, ago } from "@/lib/jobs/display";

export const metadata = { title: "Sources — Avani" };
export const dynamic = "force-dynamic";

export default async function BoardsPage({ searchParams }: { searchParams: { company?: string } }) {
  const boards = await db.jobBoard.findMany({
    orderBy: [{ enabled: "desc" }, { companyName: "asc" }],
    include: { _count: { select: { postings: { where: { closedAt: null } } } } },
  });

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub" style={{ marginBottom: 6 }}>
            <Link href="/jobs">Jobs</Link> / Sources
          </p>
          <h1>Sources</h1>
          <p className="sub">
            Feeds checked about once a day, a few per tick. Only documented public job APIs, and Workday sites whose robots.txt allows it.
          </p>
        </div>
      </div>

      {boards.length === 0 ? (
        <div className="empty-state" style={{ marginBottom: 28 }}>
          <p className="empty-title">No boards yet</p>
          <p>
            Run <code>npm run jobs:verify-boards -- --apply</code> to check the company lists and add every board that&apos;s open to fetching,
            or add one below.
          </p>
        </div>
      ) : (
        <div className="table-scroll" style={{ marginBottom: 28 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Source</th>
                <th className="num">Open postings</th>
                <th>Last fetched</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {boards.map((b) => (
                <tr key={b.id}>
                  <td>
                    {b.companyName}
                    <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
                      {b.host ? `${b.host}/` : ""}
                      {b.slug}
                    </div>
                  </td>
                  <td style={{ fontSize: "var(--text-sm)" }}>{SOURCE_LABEL[b.source] ?? b.source}</td>
                  <td className="num">{b._count.postings}</td>
                  <td style={{ fontSize: "var(--text-sm)" }}>{b.lastFetchedAt ? ago(b.lastFetchedAt) : "Never"}</td>
                  <td>
                    {!b.enabled ? (
                      <Badge tone="neutral">Paused</Badge>
                    ) : b.lastError ? (
                      <span title={b.lastError}>
                        <Badge tone="critical">Failing</Badge>
                        <div style={{ fontSize: "var(--text-sm)", color: "var(--critical)", maxWidth: 280 }}>{b.lastError}</div>
                      </span>
                    ) : b.lastFetchedAt ? (
                      <Badge tone="positive">OK</Badge>
                    ) : (
                      <Badge tone="caution">Waiting</Badge>
                    )}
                  </td>
                  <td>
                    <BoardRowActions id={b.id} enabled={b.enabled} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Eyebrow index="+">Add a board</Eyebrow>
      <div style={{ marginTop: 12 }}>
        <AddBoardForm defaultCompany={searchParams.company ?? ""} />
      </div>
    </>
  );
}
