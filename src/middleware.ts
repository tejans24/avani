import { NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";
import { isPublicPath } from "@/lib/route-access";

// Default-deny: every path not listed in route-access.ts requires sign-in.
// AUTH_MODE=test (local e2e / CI) bypasses Clerk entirely — no keys needed.
// Server actions and API routes still enforce requireAuth(), which has the
// same bypass, and the platform layout checks the ALLOWED_EMAILS allowlist.
const middleware =
  process.env.AUTH_MODE === "test"
    ? () => NextResponse.next()
    : clerkMiddleware(async (auth, req) => {
        if (!isPublicPath(req.nextUrl.pathname)) await auth.protect();
      });

export default middleware;

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
