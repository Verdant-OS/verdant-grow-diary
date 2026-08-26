/**
 * Pure, null-safe helpers that decide whether Paddle checkout may run in the
 * current browser context. Verdant's current product policy is sandbox-only:
 * only a well-formed `test_` token resolves to `"sandbox"`; every other
 * token class resolves to `"unavailable"` on every host.
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
export function classifyPaddleToken(token: string | null | undefined): PaddleTokenClass {
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
 * Detect loopback / local-development hostnames. Retained for callers that
 * need hostname diagnostics; checkout authorization no longer depends on
 * hostname because live tokens are unavailable everywhere.
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

export interface ResolvePaddleCheckoutEnvironmentInput {
  token: string | null | undefined;
  hostname: string | null | undefined;
}

/**
 * Deterministically resolve whether checkout may open in the current context.
 *
 * Rules:
 *   1. Sandbox token             → "sandbox" (all hosts)
 *   2. Live token                → "unavailable" (all hosts)
 *   3. Malformed / missing token → "unavailable"
 */
export function resolvePaddleCheckoutEnvironment(
  input: ResolvePaddleCheckoutEnvironmentInput,
): PaddleCheckoutEnvironment {
  const cls = classifyPaddleToken(input.token);
  if (cls === "sandbox") return "sandbox";
  return "unavailable";
}

/**
 * Fixed, safe copy for a blocked live token. The legacy export name is kept
 * to avoid widening this policy slice; the message applies on every host.
 */
export const CHECKOUT_UNAVAILABLE_LOCALHOST_MESSAGE =
  "Checkout disabled: Verdant currently supports Paddle sandbox testing only.";

/**
 * Fixed, safe copy for a missing or malformed token. Never reveals which
 * token class or value was present.
 */
export const CHECKOUT_UNAVAILABLE_GENERIC_MESSAGE =
  "Checkout is currently unavailable. Please try again later.";
