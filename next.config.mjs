/** @type {import('next').NextConfig} */

// Security headers for both the marketing site and the platform.
// CSP notes: 'unsafe-inline' style is required (ds components use inline
// styles); Google Fonts css/fonts allowed; Clerk domains allowed for
// real-auth deployments; frame-src 'self' keeps the invoice-PDF iframe
// working while frame-ancestors 'none' stops embedding of the app itself.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com",
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
    ];
  },
};

export default nextConfig;
