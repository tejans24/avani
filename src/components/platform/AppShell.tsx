import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { NavLink } from "./NavLink";
import { NotificationBell } from "./NotificationBell";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/invoices", label: "Invoices" },
  { href: "/clients", label: "Clients" },
  { href: "/transactions", label: "Transactions" },
  { href: "/accounts", label: "Accounts" },
  { href: "/reports", label: "Reports" },
  { href: "/activity", label: "Activity" },
  { href: "/settings", label: "Settings" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const testMode = process.env.AUTH_MODE === "test";
  return (
    <div className="platform-shell">
      <aside className="platform-sidebar">
        <Link href="/" className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mark-sun.svg" alt="" width={26} height={26} />
          Avani
        </Link>
        <nav className="platform-nav">
          {NAV.map((item) => (
            <NavLink key={item.href} href={item.href}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          {testMode ? <span>Test mode</span> : <UserButton afterSignOutUrl="/" />}
          <span>Avani Platform</span>
          <NotificationBell />
        </div>
      </aside>
      <main className="platform-main">{children}</main>
    </div>
  );
}
