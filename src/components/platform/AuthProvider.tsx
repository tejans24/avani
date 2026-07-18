import { ClerkProvider } from "@clerk/nextjs";

/**
 * Wraps children in ClerkProvider except in AUTH_MODE=test, where the app
 * runs without Clerk keys (local e2e / CI).
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (process.env.AUTH_MODE === "test") return <>{children}</>;
  return <ClerkProvider>{children}</ClerkProvider>;
}
