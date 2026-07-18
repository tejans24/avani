import Link from "next/link";
import { SignIn } from "@clerk/nextjs";

export const metadata = { title: "Sign in — Avani" };

export default function SignInPage() {
  if (process.env.AUTH_MODE === "test") {
    return (
      <main className="signin-wrap">
        <p style={{ fontFamily: "var(--font-sans)", color: "var(--text-secondary)" }}>
          Test auth mode — <Link href="/dashboard" style={{ color: "var(--color-accent)" }}>continue to dashboard</Link>
        </p>
      </main>
    );
  }
  return (
    <main className="signin-wrap">
      <SignIn />
    </main>
  );
}
