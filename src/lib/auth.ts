import { auth, currentUser } from "@clerk/nextjs/server";

export type AuthedUser = { userId: string; email: string };

export function isTestAuth() {
  return process.env.AUTH_MODE === "test";
}

/**
 * Single-tenant guard used by every server action and protected route handler.
 * Signing in with Clerk is not enough — the account's email must also be on
 * the ALLOWED_EMAILS allowlist.
 */
export async function requireAuth(): Promise<AuthedUser> {
  if (isTestAuth()) {
    return { userId: "test-user", email: "owner@example.com" };
  }

  const { userId } = await auth();
  if (!userId) {
    throw new Error("Unauthorized: sign in required.");
  }

  const user = await currentUser();
  const emails =
    user?.emailAddresses?.map((e) => e.emailAddress.toLowerCase()) ?? [];
  const allowed = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const match = emails.find((e) => allowed.includes(e));
  if (!match) {
    throw new Error("Access denied: this account is not authorized.");
  }

  return { userId, email: match };
}
