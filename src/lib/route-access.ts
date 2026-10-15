/**
 * Which paths are public. Everything else requires sign-in (middleware) and
 * the ALLOWED_EMAILS allowlist (platform layout + requireAuth in every action
 * and API route). Public by design:
 *   - the marketing site at "/"
 *   - Clerk sign-in pages
 *   - client invoice share links (/i/{token}, token-gated)
 *   - the cron tick (authenticated by TICK_SECRET / CRON_SECRET itself)
 *   - the web app manifest (needed for install / share target)
 *
 * Default-deny: a new page or route is protected without anyone remembering
 * to add it to a list. (The old allowlist of protected paths missed
 * /transactions, /accounts and /activity.)
 */
const PUBLIC_PATHS: RegExp[] = [
  /^\/$/,
  /^\/sign-in(\/.*)?$/,
  /^\/i\/[^/]+(\/.*)?$/,
  /^\/api\/events\/tick\/?$/,
  /^\/manifest\.webmanifest$/,
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((re) => re.test(pathname));
}
