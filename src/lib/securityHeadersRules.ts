/**
 * Security response headers for the Cloudflare Worker (SSR document, server
 * functions, error pages). Pure, deterministic, null-safe — no I/O.
 *
 * Scope and intent:
 * - These headers are applied by `src/server.ts` to every response the Worker
 *   produces. Static assets are served by the Workers Assets binding before the
 *   Worker runs, so `public/_headers` carries the same baseline for them.
 * - Content-Security-Policy ships REPORT-ONLY. TanStack Start injects inline
 *   hydration scripts and inline styles, so an enforcing policy needs a nonce
 *   pass first. The report-only header never blocks anything; browsers log
 *   violations to the devtools console (there is no report endpoint yet — that
 *   lands with production error reporting).
 * - HSTS is deliberately conservative: no `includeSubDomains`, no `preload`.
 *   `notify.` is NS-delegated for email only and `verdantgrowdiary.app` is a
 *   separate zone; widening HSTS is an owner decision, not a default.
 * - Existing headers are never overwritten, so a route can tighten or loosen a
 *   header for itself and this layer stays out of the way.
 */

export const STRICT_TRANSPORT_SECURITY_VALUE = "max-age=31536000";

/**
 * Third-party origins the client is known to talk to. Keep this list the single
 * place that enumerates them; the policy below is derived from it.
 */
export const KNOWN_THIRD_PARTY_ORIGINS = {
  supabase: ["https://*.supabase.co", "wss://*.supabase.co"],
  paddle: ["https://*.paddle.com"],
  googleFonts: ["https://fonts.googleapis.com", "https://fonts.gstatic.com"],
  googleAnalytics: [
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
    "https://analytics.google.com",
  ],
  lovableAuth: ["https://api.lovable.dev"],
  /** Error-report ingest (PR #1938 reporter). Report-only CSP; nothing is blocked either way. */
  sentryIngest: [
    "https://*.ingest.sentry.io",
    "https://*.ingest.us.sentry.io",
    "https://*.ingest.de.sentry.io",
  ],
} as const;

function joinSources(...groups: ReadonlyArray<ReadonlyArray<string>>): string {
  return groups.flat().join(" ");
}

/**
 * Report-only CSP. 'unsafe-inline' is required today for TanStack Start's
 * hydration scripts and Tailwind/Radix inline styles; tightening to nonces is
 * the follow-up once violation reports are collected.
 */
export function buildContentSecurityPolicyReportOnly(): string {
  const { supabase, paddle, googleFonts, googleAnalytics, lovableAuth, sentryIngest } =
    KNOWN_THIRD_PARTY_ORIGINS;
  const directives: ReadonlyArray<[string, string]> = [
    ["default-src", "'self'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'self'"],
    ["object-src", "'none'"],
    ["script-src", joinSources(["'self'", "'unsafe-inline'"], paddle, googleAnalytics)],
    ["style-src", joinSources(["'self'", "'unsafe-inline'"], [googleFonts[0]])],
    ["font-src", joinSources(["'self'", "data:"], [googleFonts[1]])],
    ["img-src", "'self' data: blob: https:"],
    ["media-src", "'self' blob: https:"],
    [
      "connect-src",
      joinSources(["'self'"], supabase, paddle, googleAnalytics, lovableAuth, sentryIngest),
    ],
    ["frame-src", joinSources(["'self'"], paddle)],
    ["worker-src", "'self' blob:"],
    ["manifest-src", "'self'"],
  ];
  return directives.map(([name, value]) => `${name} ${value}`).join("; ");
}

/**
 * Baseline headers applied to every Worker response. Header names are
 * canonical-cased for readability; lookups are case-insensitive.
 */
export function buildSecurityHeaders(): ReadonlyArray<[string, string]> {
  return [
    ["Strict-Transport-Security", STRICT_TRANSPORT_SECURITY_VALUE],
    ["X-Content-Type-Options", "nosniff"],
    ["X-Frame-Options", "SAMEORIGIN"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    ["Permissions-Policy", "geolocation=(), microphone=()"],
    ["Content-Security-Policy-Report-Only", buildContentSecurityPolicyReportOnly()],
  ];
}

/** Header names this layer must never emit as enforcing. */
export const FORBIDDEN_ENFORCING_HEADERS: ReadonlyArray<string> = ["content-security-policy"];

/**
 * Returns a Response carrying the baseline security headers. Headers already
 * present on the input are preserved untouched. Null/undefined input yields
 * null so callers can pass through unexpected values safely. The input
 * Response is never mutated (its headers may be immutable on Workers).
 */
export function applySecurityHeaders<T extends Response | null | undefined>(response: T): T {
  if (!response) return response;
  const headers = new Headers(response.headers);
  let changed = false;
  for (const [name, value] of buildSecurityHeaders()) {
    if (headers.has(name)) continue;
    headers.set(name, value);
    changed = true;
  }
  if (!changed) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  }) as T;
}
