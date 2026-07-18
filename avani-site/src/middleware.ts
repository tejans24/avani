import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/clients(.*)",
  "/invoices(.*)",
  "/reports(.*)",
  "/settings(.*)",
  "/api/invoices(.*)",
]);

// AUTH_MODE=test (local e2e / CI) bypasses Clerk entirely — no keys needed.
// Server actions still enforce requireAuth(), which has the same bypass.
const middleware =
  process.env.AUTH_MODE === "test"
    ? () => NextResponse.next()
    : clerkMiddleware(async (auth, req) => {
        if (isProtectedRoute(req)) await auth.protect();
      });

export default middleware;

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
