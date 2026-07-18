import Link from "next/link";
import { SignIn } from "@clerk/nextjs";

export const metadata = { title: "Sign in — Avani" };

const wrapStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
  background: "var(--color-bg)",
};

export default function SignInPage() {
  if (process.env.AUTH_MODE === "test") {
    return (
      <main style={wrapStyle}>
        <div
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-xl)",
            boxShadow: "var(--shadow-md)",
            padding: "40px 44px",
            maxWidth: 420,
            textAlign: "center",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mark-sun.svg" alt="" width={36} height={36} style={{ marginBottom: 14 }} />
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-xl)",
              fontWeight: "var(--weight-medium)" as React.CSSProperties["fontWeight"],
              letterSpacing: "var(--tracking-tight)",
              color: "var(--text-primary)",
              margin: "0 0 8px",
            }}
          >
            Avani Platform
          </h1>
          <p
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--text-sm)",
              color: "var(--text-secondary)",
              margin: 0,
            }}
          >
            Test auth mode —{" "}
            <Link href="/dashboard" style={{ color: "var(--color-accent)" }}>
              continue to dashboard
            </Link>
          </p>
        </div>
      </main>
    );
  }
  return (
    <main style={wrapStyle}>
      <SignIn />
    </main>
  );
}
