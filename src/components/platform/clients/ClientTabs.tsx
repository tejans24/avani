import Link from "next/link";

export type ClientTabKey = "overview" | "people" | "timeline";

const LABELS: Record<ClientTabKey, string> = {
  overview: "Overview",
  people: "People",
  timeline: "Timeline",
};

/**
 * The client-detail tab bar. Tabs are plain links (?tab=…) so each is
 * server-rendered and shareable. `counts` badges the People/Timeline tabs.
 */
export function ClientTabs({
  clientId,
  active,
  tabs,
  counts = {},
}: {
  clientId: string;
  active: ClientTabKey;
  tabs: ClientTabKey[];
  counts?: Partial<Record<ClientTabKey, number>>;
}) {
  return (
    <div className="filter-tabs" style={{ marginBottom: 24 }}>
      {tabs.map((tab) => {
        const href = tab === "overview" ? `/clients/${clientId}` : `/clients/${clientId}?tab=${tab}`;
        const count = counts[tab];
        return (
          <Link key={tab} href={href} data-active={active === tab || undefined}>
            {LABELS[tab]}
            {typeof count === "number" && count > 0 ? ` (${count})` : ""}
          </Link>
        );
      })}
    </div>
  );
}
