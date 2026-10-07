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
 * - HSTS is identical to the policy the apex already publishes (`vercel.json`;
 *   `docs/release/hosting-failover-plan.md` § Header rules: "keep it identical,
 *   never weaker"). Owner decision 2026-10-07 on PR #1937.
 * - Route-specific headers (today only `/unsubscribe`, mirroring `vercel.json`)
 *   override the baseline for that path, because the more specific rule must win.
 * - Baseline headers never overwrite a header the response already carries, so
 *   a route can tighten or loosen one for itself. Only ROUTE_SECURITY_HEADERS
 *   override existing values, because the more specific rule must win.
 * - The non-CSP baseline is identical to `vercel.json`'s `/(.*)` rule, including
 *   `camera=()` and `payment=()`: photo capture uses `<input capture>`, which
 *   Permissions-Policy does not gate, and the app calls neither getUserMedia
 *   nor the Payment Request API.
 */

export const STRICT_TRANSPORT_SECURITY_VALUE = "max-age=63072000; includeSubDomains; preload";

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
    ["Permissions-Policy", "geolocation=(), camera=(), microphone=(), payment=()"],
    ["Content-Security-Policy-Report-Only", buildContentSecurityPolicyReportOnly()],
  ];
}

/**
 * Path-specific headers, mirroring the `vercel.json` route rules. `/unsubscribe`
 * carries a token in its query string: no referrer may leak it, and the page must
 * be neither cached nor indexed.
 */
export const ROUTE_SECURITY_HEADERS: Readonly<Record<string, ReadonlyArray<[string, string]>>> = {
  "/unsubscribe": [
    ["Cache-Control", "no-store"],
    ["Referrer-Policy", "no-referrer"],
    ["X-Robots-Tag", "noindex, nofollow, noarchive"],
  ],
};

/** Route headers for a pathname (trailing slash ignored), or an empty list. */
export function buildRouteSecurityHeaders(
  pathname: string | null | undefined,
): ReadonlyArray<[string, string]> {
  if (typeof pathname !== "string" || pathname.length === 0) return [];
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return ROUTE_SECURITY_HEADERS[normalized] ?? [];
}

/** Header names this layer must never emit as enforcing. */
export const FORBIDDEN_ENFORCING_HEADERS: ReadonlyArray<string> = ["content-security-policy"];

/**
 * Returns a Response carrying the baseline security headers. Headers already
 * present on the input are preserved untouched, except that the route headers
 * for `pathname` (see ROUTE_SECURITY_HEADERS) always win. Null/undefined input
 * yields null so callers can pass through unexpected values safely. The input
 * Response is never mutated (its headers may be immutable on Workers).
 */
export function applySecurityHeaders<T extends Response | null | undefined>(
  response: T,
  pathname?: string | null,
): T {
  if (!response) return response;
  const headers = new Headers(response.headers);
  let changed = false;
  for (const [name, value] of buildRouteSecurityHeaders(pathname)) {
    if (headers.get(name) === value) continue;
    headers.set(name, value);
    changed = true;
  }
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
