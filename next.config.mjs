/** @type {import('next').NextConfig} */

// Security headers for both the marketing site and the platform.
// CSP notes: 'unsafe-inline' style is required (ds components use inline
// styles); Google Fonts css/fonts allowed; Clerk domains allowed for
// real-auth deployments. frame-ancestors 'none' stops embedding of the app
// itself; the two PDFs the app shows in its own preview iframes (invoice,
// tailored résumé) get frame-ancestors 'self' instead, below, or the browser
// refuses to display them.
// 'unsafe-eval' is required only by Next.js dev-mode tooling (webpack eval
// sourcemaps); production CSP omits it.
const scriptEval = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${scriptEval} https://*.clerk.accounts.dev https://*.clerk.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://img.clerk.com",
  "connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://fonts.googleapis.com https://fonts.gstatic.com",
  "worker-src 'self' blob:",
  "frame-src 'self' https://*.clerk.accounts.dev https://*.clerk.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig = {
  experimental: {
    // The résumé PDF embeds Carlito from src/pdf/fonts; make sure the font
    // files ship with the serverless function.
    outputFileTracingIncludes: {
      "/api/jobs/tailored/[id]/pdf": ["./src/pdf/fonts/**"],
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      // Later entries win for the same header: PDFs previewed inside the app may be framed by the app only.
      ...["/api/invoices/:id/pdf", "/api/jobs/tailored/:id/pdf"].map((source) => ({
        source,
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self'" }],
      })),
    ];
  },
};

export default nextConfig;
