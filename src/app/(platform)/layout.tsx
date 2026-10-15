import "./platform.css";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/platform/AppShell";
import { requireAuth } from "@/lib/auth";

export const metadata = { title: "Avani Platform" };

/**
 * Every platform page renders inside this layout, so the single-tenant
 * allowlist (ALLOWED_EMAILS) is checked here as well as in each action and
 * API route: being signed in to Clerk is not enough to see the data.
 */
export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireAuth();
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (message.startsWith("Unauthorized")) redirect("/sign-in");
    return (
      <main style={{ padding: 48, fontFamily: "var(--font-sans)" }}>
        <h1>Access denied</h1>
        <p>This account isn&apos;t authorized to use this workspace.</p>
      </main>
    );
  }
  return <AppShell>{children}</AppShell>;
}
