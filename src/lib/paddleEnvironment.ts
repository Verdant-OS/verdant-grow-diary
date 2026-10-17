/**
 * Pure, null-safe helpers that decide whether Paddle checkout may run in the
 * current browser context. A well-formed `test_` token resolves to
 * `"sandbox"` on every host. A well-formed `live_` token resolves to
 * `"live"` only on an explicit production hostname
 * (`PRODUCTION_CHECKOUT_HOSTNAMES`) and to `"unavailable"` everywhere else,
 * so previews, staging and local builds can never open live checkout.
 * Missing or malformed tokens are `"unavailable"`.
 *
 * SAFETY:
 *  - Never logs, returns, or embeds the token value.
 *  - Inspects the prefix and, for `live_`, only the payload SHAPE (Paddle
 *    client tokens are the prefix plus 27 letters/digits) — never returns or
 *    logs the payload.
 *  - Pure functions: no imports, no window access, no side effects. Callers
 *    pass hostname explicitly so this module stays SSR/test friendly.
 */

export type PaddleTokenClass = "sandbox" | "live" | "unavailable";
export type PaddleCheckoutEnvironment = "sandbox" | "live" | "unavailable";

/**
 * Paddle documents client-side tokens as the prefix (`test_` or `live_`) plus
 * exactly 27 letters and digits. A value of any other shape (for example
 * `live_invalid` or `test_abc`) is malformed and must never initialize Paddle.
 */
const PADDLE_SANDBOX_CLIENT_TOKEN_SHAPE = /^test_[A-Za-z0-9]{27}$/;
const PADDLE_LIVE_CLIENT_TOKEN_SHAPE = /^live_[A-Za-z0-9]{27}$/;

/**
 * Classify a raw Paddle client token.
 *
 * - `"test_"` + 27 letters/digits → `"sandbox"`
 * - `"live_"` + 27 letters/digits → `"live"`
 * - any other shape, null / undefined / empty / whitespace / unknown prefix → `"unavailable"`
 *
 * The token payload is never returned or logged.
 */
export function classifyPaddleToken(token: string | null | undefined): PaddleTokenClass {
  if (typeof token !== "string") return "unavailable";
  const trimmed = token.trim();
  if (trimmed.length === 0) return "unavailable";
  if (PADDLE_SANDBOX_CLIENT_TOKEN_SHAPE.test(trimmed)) {
    return "sandbox";
  }
  if (PADDLE_LIVE_CLIENT_TOKEN_SHAPE.test(trimmed)) {
    return "live";
  }
  return "unavailable";
}

/**
 * Detect loopback / local-development hostnames. Retained for callers that
 * need hostname diagnostics. Live checkout authorization uses the explicit
 * production allowlist below, so loopback is never a live host either way.
 *
 * Matches:
 *   - "localhost" and any "*.localhost" subdomain
 *   - IPv4 loopback "127.0.0.1" and the full 127.0.0.0/8 range
 *   - IPv6 loopback "::1" (with or without zone/port stripped by caller)
 *   - "0.0.0.0"
 */
export function isLoopbackHostname(hostname: string | null | undefined): boolean {
  if (typeof hostname !== "string") return false;
  const h = hostname.trim().toLowerCase();
  if (h.length === 0) return false;
  if (h === "localhost") return true;
  if (h.endsWith(".localhost")) return true;
  if (h === "::1") return true;
  if (h === "0.0.0.0") return true;
  // IPv4 127.0.0.0/8
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const c = Number(m[3]);
    const d = Number(m[4]);
    if ([a, b, c, d].every((n) => n >= 0 && n <= 255) && a === 127) {
      return true;
    }
  }
  return false;
}

/**
 * The only hostnames where a live token may open live checkout. Exact,
 * lowercase matches; no suffix or wildcard matching, so preview hosts such as
 * `*.lovable.app`, `*.pages.dev` or `*.workers.dev` never qualify.
 */
export const PRODUCTION_CHECKOUT_HOSTNAMES: readonly string[] = Object.freeze([
  "verdantgrowdiary.com",
  "www.verdantgrowdiary.com",
]);

export function isProductionCheckoutHostname(hostname: string | null | undefined): boolean {
  if (typeof hostname !== "string") return false;
  // A single trailing dot is the same fully-qualified host.
  const h = hostname.trim().toLowerCase().replace(/\.$/, "");
  return PRODUCTION_CHECKOUT_HOSTNAMES.includes(h);
}

export interface ResolvePaddleCheckoutEnvironmentInput {
  token: string | null | undefined;
  hostname: string | null | undefined;
  /**
   * Build-time checkout kill switch (`VITE_CHECKOUT_DISABLED="true"`). When
   * true, checkout is unavailable on EVERY host, including production. This is
   * the rollback artifact: it disables new checkout without touching tokens,
   * secrets, entitlement reads or existing subscriptions.
   */
  checkoutDisabled?: boolean;
}

/** Parse the build-time kill switch. Only the exact string "true" disables. */
export function isCheckoutDisabledFlag(value: unknown): boolean {
  // Exact match only: a whitespace typo must not ship a closed-checkout build.
  return value === "true";
}

/**
 * Deterministically resolve whether checkout may open in the current context.
 *
 * Rules:
 *   1. Sandbox token                         → "sandbox" (all hosts)
 *   2. Live token on a production hostname   → "live"
 *   3. Live token on any other host          → "unavailable"
 *   4. Malformed / missing token             → "unavailable"
 */
export function resolvePaddleCheckoutEnvironment(
  input: ResolvePaddleCheckoutEnvironmentInput,
): PaddleCheckoutEnvironment {
  if (input.checkoutDisabled === true) return "unavailable";
  const cls = classifyPaddleToken(input.token);
  if (cls === "sandbox") return "sandbox";
  if (cls === "live" && isProductionCheckoutHostname(input.hostname)) return "live";
  return "unavailable";
}

/**
 * Fixed, safe copy for a live token outside the production hostnames. The
 * legacy export name is kept for existing callers.
 */
export const CHECKOUT_UNAVAILABLE_LOCALHOST_MESSAGE =
  "Live checkout is only available on verdantgrowdiary.com.";

/** Fixed, safe copy while the build-time kill switch is on. */
export const CHECKOUT_PAUSED_MESSAGE =
  "New checkout is paused. Existing plans, renewals and billing management are not affected.";

/**
 * Fixed, safe copy for a missing or malformed token. Never reveals which
 * token class or value was present.
 */
export const CHECKOUT_UNAVAILABLE_GENERIC_MESSAGE =
  "Checkout is currently unavailable. Please try again later.";
