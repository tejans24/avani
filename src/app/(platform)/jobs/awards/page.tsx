import Link from "next/link";
import { db } from "@/lib/db";
import { Badge, Eyebrow } from "@/components/platform/ds";
import { AwardQueryActions } from "@/components/platform/jobs/AwardQueryActions";
import { AWARD_LOOKBACK_DAYS, formatAwardAmount, isCurrentAward } from "@/lib/jobs/awards";
import { ensureDefaultAwardQueries } from "@/lib/jobs/awards-refresh";
import { normalizeCompany } from "@/lib/jobs/dedupe";
import { ago } from "@/lib/jobs/display";

export const metadata = { title: "Federal awards — Avani" };
export const dynamic = "force-dynamic";

const GROUPS = { climate: "Climate & environment", "health-civic": "Health & civic" } as const;
type Group = keyof typeof GROUPS;

const fmtDate = (d: Date | null) => (d ? d.toISOString().slice(0, 7) : "—");

/**
 * Who just won IT and research contracts at the agencies you care about.
 * A fresh award usually means hiring, often before postings appear.
 */
export default async function AwardsPage({ searchParams }: { searchParams: { group?: string } }) {
  await ensureDefaultAwardQueries();
  const group: Group = searchParams.group === "health-civic" ? "health-civic" : "climate";
  const now = new Date();
  const since = new Date(now.getTime() - AWARD_LOOKBACK_DAYS * 86_400_000);

  const [queries, awards, boards] = await Promise.all([
    db.awardQuery.findMany({ orderBy: [{ group: "asc" }, { label: "asc" }] }),
    db.contractAward.findMany({
      where: { query: { group }, OR: [{ startDate: { gte: since } }, { firstSeenAt: { gte: since } }] },
      orderBy: { amountCents: { sort: "desc", nulls: "last" } },
      include: {
        query: { select: { label: true } },
        company: { select: { id: true, name: true, normalizedName: true, _count: { select: { postings: { where: { closedAt: null, filterFailures: { isEmpty: true } } } } } } },
      },
      take: 500,
    }),
    db.jobBoard.findMany({ select: { companyName: true } }),
  ]);
  const boardNames = new Set(boards.map((b) => normalizeCompany(b.companyName)));

  type Row = { key: string; name: string; companyId: string | null; openMatches: number; hasBoard: boolean; agencies: Set<string>; awards: typeof awards };
  const byCompany = new Map<string, Row>();
  for (const a of awards) {
    const key = a.company?.normalizedName ?? a.normalizedRecipient;
    const row =
      byCompany.get(key) ??
      ({
        key,
        name: a.company?.name ?? a.recipientName,
        companyId: a.company?.id ?? null,
        openMatches: a.company?._count.postings ?? 0,
        hasBoard: boardNames.has(key),
        agencies: new Set<string>(),
        awards: [],
      } as Row);
    row.agencies.add(a.query?.label ?? a.agency);
    row.awards.push(a);
    byCompany.set(key, row);
  }
  const rows = [...byCompany.values()];
  const groupQueries = queries.filter((q) => q.group === group);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub" style={{ marginBottom: 6 }}>
            <Link href="/jobs">Jobs</Link> / Federal awards
          </p>
          <h1>Federal awards</h1>
          <p className="sub">
            IT and research contracts awarded in the last {AWARD_LOOKBACK_DAYS} days (USAspending.gov). Winners staff up, often before they post. Companies
            here also get an &quot;awarded work&quot; boost on their postings.
          </p>
        </div>
      </div>

      <div className="filter-tabs">
        {(Object.keys(GROUPS) as Group[]).map((g) => (
          <Link key={g} href={`/jobs/awards?group=${g}`} data-active={group === g || undefined}>
            {GROUPS[g]}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="empty-state" style={{ marginBottom: 28 }}>
          <p className="empty-title">No awards yet</p>
          <p>Agencies refresh about once a day, one per tick. Use Refresh below to fetch one now.</p>
        </div>
      ) : (
        <div className="table-scroll" style={{ marginBottom: 28 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Agency</th>
                <th>Largest recent award</th>
                <th className="num">Awards</th>
                <th>Jobs</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const top = r.awards[0];
                const current = isCurrentAward(top, now);
                return (
                  <tr key={r.key} data-testid="award-row">
                    <td>{r.name}</td>
                    <td style={{ fontSize: "var(--text-sm)" }}>{[...r.agencies].join(", ")}</td>
                    <td style={{ fontSize: "var(--text-sm)", maxWidth: 380 }}>
                      <a href={top.url} target="_blank" rel="noreferrer">
                        {formatAwardAmount(top.amountCents)}
                      </a>{" "}
                      {top.description ? `· ${top.description.toLowerCase()}` : ""}
                      <div style={{ color: "var(--text-muted)" }}>
                        {top.piid} · {fmtDate(top.startDate)} to {fmtDate(top.endDate)}
                        {current ? "" : " · ended"}
                      </div>
                    </td>
                    <td className="num">{r.awards.length}</td>
                    <td style={{ fontSize: "var(--text-sm)" }}>
                      {r.openMatches > 0 && <Badge tone="positive">{r.openMatches} open match{r.openMatches === 1 ? "" : "es"}</Badge>}
                      {r.hasBoard ? (
                        <div style={{ color: "var(--text-muted)" }}>Board added</div>
                      ) : (
                        <div style={{ display: "grid", gap: 2 }}>
                          <a href={`https://www.google.com/search?q=${encodeURIComponent(`${r.name} careers`)}`} target="_blank" rel="noreferrer">
                            Find careers page
                          </a>
                          <Link href={`/jobs/boards?company=${encodeURIComponent(r.name)}`}>Add board</Link>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Eyebrow index="⟳">Agencies watched</Eyebrow>
      <div className="table-scroll" style={{ marginTop: 12 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Agency</th>
              <th>Last fetched</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {groupQueries.map((q) => (
              <tr key={q.id}>
                <td>
                  {q.label}
                  <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>{q.agencyName}</div>
                </td>
                <td style={{ fontSize: "var(--text-sm)" }}>{q.lastFetchedAt ? ago(q.lastFetchedAt) : "Never"}</td>
                <td>
                  {!q.enabled ? (
                    <Badge tone="neutral">Paused</Badge>
                  ) : q.lastError ? (
                    <span title={q.lastError}>
                      <Badge tone="critical">Failing</Badge>
                    </span>
                  ) : q.lastFetchedAt ? (
                    <Badge tone="positive">OK</Badge>
                  ) : (
                    <Badge tone="caution">Waiting</Badge>
                  )}
                </td>
                <td>
                  <AwardQueryActions id={q.id} enabled={q.enabled} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
