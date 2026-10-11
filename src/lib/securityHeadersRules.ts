/**
 * Report-only Content-Security-Policy for Worker responses.
 *
 * Pure, deterministic, and null-safe. This module does not apply headers.
 * `src/lib/cloudflareHostRoutingRules.ts` is the only place that attaches
 * response headers, including this one, so a header is defined once.
 *
 * The policy is report-only. TanStack Start injects inline hydration scripts
 * and inline styles, so an enforcing policy needs a nonce pass first. Browsers
 * log violations to the devtools console. There is no report endpoint yet.
 *
 * Static files served by the Workers assets binding (`public/_headers`) do not
 * get this header. CSP applies to the documents the Worker returns.
 */

/**
 * Third-party origins the client is known to talk to. The policy below is
 * derived from this list.
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

export const CONTENT_SECURITY_POLICY_REPORT_ONLY_HEADER = "Content-Security-Policy-Report-Only";

/** Header names this layer must never emit as enforcing. */
export const FORBIDDEN_ENFORCING_HEADERS: ReadonlyArray<string> = ["content-security-policy"];

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
