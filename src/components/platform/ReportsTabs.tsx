import Link from "next/link";

const TABS = [
  { href: "/reports", label: "Overview" },
  { href: "/reports/pnl", label: "P&L" },
  { href: "/reports/taxes", label: "Taxes" },
];

export function ReportsTabs({ active }: { active: string }) {
  return (
    <div className="filter-tabs" style={{ marginBottom: 24 }}>
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} data-active={t.href === active || undefined}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
