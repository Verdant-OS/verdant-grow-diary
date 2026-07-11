/**
 * Pure, null-safe helpers that decide whether Paddle checkout may run in the
 * current browser context. Fail-closed: unknown or unsafe combinations
 * resolve to `"unavailable"` so callers cannot accidentally open a live
 * Paddle overlay against a localhost preview.
 *
 * SAFETY:
 *  - Never logs, returns, or embeds the token value.
 *  - Only inspects the token PREFIX ("test_" | "live_") — never the payload.
 *  - Pure functions: no imports, no window access, no side effects. Callers
 *    pass hostname explicitly so this module stays SSR/test friendly.
 */

export type PaddleTokenClass = "sandbox" | "live" | "unavailable";
export type PaddleCheckoutEnvironment = "sandbox" | "live" | "unavailable";

/**
 * Classify a raw Paddle client token by prefix only.
 *
 * - `"test_..."`  → `"sandbox"`
 * - `"live_..."`  → `"live"`
 * - null / undefined / empty / whitespace / unknown prefix → `"unavailable"`
 *
 * The token payload after the prefix is never inspected and never returned.
 */
export function classifyPaddleToken(
  token: string | null | undefined,
): PaddleTokenClass {
  if (typeof token !== "string") return "unavailable";
  const trimmed = token.trim();
  if (trimmed.length === 0) return "unavailable";
  // Guard: reject tokens that are only the prefix ("test_" / "live_" with
  // no payload) — those are malformed and must not initialize Paddle.
  if (trimmed.startsWith("test_") && trimmed.length > "test_".length) {
    return "sandbox";
  }
  if (trimmed.startsWith("live_") && trimmed.length > "live_".length) {
    return "live";
  }
  return "unavailable";
}

/**
 * Detect loopback / local-development hostnames. Treats missing/empty input
 * as NOT loopback so server-render contexts (no window) don't accidentally
 * mark a real host as loopback.
 *
 * Matches:
 *   - "localhost" and any "*.localhost" subdomain
 *   - IPv4 loopback "127.0.0.1" and the full 127.0.0.0/8 range
 *   - IPv6 loopback "::1" (with or without zone/port stripped by caller)
 *   - "0.0.0.0"
 */
export function isLoopbackHostname(
  hostname: string | null | undefined,
): boolean {
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

export interface ResolvePaddleCheckoutEnvironmentInput {
  token: string | null | undefined;
  hostname: string | null | undefined;
}

/**
 * Deterministically resolve whether checkout may open in the current context.
 *
 * Rules:
 *   1. Malformed / missing token       → "unavailable"
 *   2. Sandbox token                   → "sandbox"        (loopback OK)
 *   3. Live token on loopback host     → "unavailable"    (fail closed)
 *   4. Live token on non-loopback host → "live"
 */
export function resolvePaddleCheckoutEnvironment(
  input: ResolvePaddleCheckoutEnvironmentInput,
): PaddleCheckoutEnvironment {
  const cls = classifyPaddleToken(input.token);
  if (cls === "unavailable") return "unavailable";
  if (cls === "sandbox") return "sandbox";
  // cls === "live"
  if (isLoopbackHostname(input.hostname)) return "unavailable";
  return "live";
}

/**
 * Fixed, safe copy for the loopback+live blocking banner. Kept as an
 * exported constant so the banner and its test read the same string.
 */
export const CHECKOUT_UNAVAILABLE_LOCALHOST_MESSAGE =
  "Checkout disabled: localhost requires a Paddle sandbox token.";

/**
 * Fixed, safe copy for the generic unavailable case (missing/malformed
 * token on a non-loopback host — e.g. a production build shipped without
 * a token). Never reveals which case applied.
 */
export const CHECKOUT_UNAVAILABLE_GENERIC_MESSAGE =
  "Checkout is currently unavailable. Please try again later.";
