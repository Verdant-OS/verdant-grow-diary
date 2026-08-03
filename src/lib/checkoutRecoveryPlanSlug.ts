/**
 * checkoutRecoveryPlanSlug — the single sanitizer every checkout-recovery
 * analytics call site MUST route the `plan` field through before emitting a
 * pricing or funnel event.
 *
 * Why this exists:
 *  - Recovery events (`pricing_checkout_recovery_{retry,choose_another_plan,
 *    dismissed}` and their funnel mirrors) must always carry the *sanitized*
 *    plan identifier the grower actually acted on, drawn from the shared
 *    PAID_PLAN_ALLOWLIST — never a route, a nickname, a raw Paddle price id,
 *    a free-form label, or any other internal plan metadata.
 *  - Typing `lastCheckoutPlanRef` alone is not enough: a future edit could
 *    widen the ref, seed it from URL state, or forward server-provided
 *    strings straight into `trackFunnelEvent`. This helper is the runtime
 *    fence that keeps that from becoming a leak.
 *  - When the caller has nothing valid to report (missing state, unknown
 *    slug, malformed value), we emit the stable `"unknown_plan"` token so
 *    the analytics contract stays uniform and the funnel sanitizer's
 *    whitespace / length rules still accept it.
 *
 * Fallback telemetry:
 *  - Every fallback bumps an in-memory counter (`getUnknownPlanSlugFallbackCount`)
 *    that the Diagnostics panel and tests can read.
 *  - A single-line, PII-free `console.warn` records the type-class of the
 *    rejected value (never its contents — a rejected string could be free
 *    text). Emissions are throttled per unique type-class to avoid flooding
 *    the console when a broken caller loops.
 *  - No user id, no route, no raw value ever crosses this seam.
 */

import { PAID_PLAN_ALLOWLIST, type PaidPlanId } from "@/lib/paidPlanAllowlist";
import { trackFunnelEvent } from "@/lib/funnelAnalytics";

/** Stable fallback token — enum-like, no whitespace, funnel-sanitizer safe. */
export const CHECKOUT_RECOVERY_UNKNOWN_PLAN_SLUG = "unknown_plan" as const;

export type CheckoutRecoveryPlanSlug = PaidPlanId | typeof CHECKOUT_RECOVERY_UNKNOWN_PLAN_SLUG;

/**
 * Non-sensitive classification of a rejected input. Never carries the raw
 * value — a rejected string might be free text (e.g. a nickname pasted into
 * URL state), which we must not surface anywhere.
 */
export type UnknownPlanSlugFallbackReason =
  | "missing" // undefined or null
  | "wrong_type" // not a string (number, boolean, object, array, symbol, function)
  | "empty_string" // zero-length string
  | "not_in_allowlist"; // string, non-empty, but not a paid plan id

export interface UnknownPlanSlugFallbackTelemetry {
  reason: UnknownPlanSlugFallbackReason;
  /** Length bucket (`"0"`, `"1-8"`, `"9-32"`, `"33+"`) — coarse, non-identifying. */
  lengthBucket: "0" | "1-8" | "9-32" | "33+";
}

let unknownFallbackCount = 0;
const warnedReasons = new Set<string>();

function classify(value: unknown): UnknownPlanSlugFallbackTelemetry {
  if (value === undefined || value === null) {
    return { reason: "missing", lengthBucket: "0" };
  }
  if (typeof value !== "string") {
    return { reason: "wrong_type", lengthBucket: "0" };
  }
  const length = value.length;
  const lengthBucket: UnknownPlanSlugFallbackTelemetry["lengthBucket"] =
    length === 0 ? "0" : length <= 8 ? "1-8" : length <= 32 ? "9-32" : "33+";
  if (length === 0) {
    return { reason: "empty_string", lengthBucket };
  }
  return { reason: "not_in_allowlist", lengthBucket };
}

function emitFallbackWarning(telemetry: UnknownPlanSlugFallbackTelemetry): void {
  // Throttle console.warn: at most once per (reason,bucket) tuple per session
  // so a stuck caller can't flood devtools. The counter and the aggregated
  // analytics event still fire on every call.
  const key = `${telemetry.reason}:${telemetry.lengthBucket}`;
  if (warnedReasons.has(key)) return;
  warnedReasons.add(key);
  try {
    // Single-line JSON keeps this easy to grep in browser devtools and CI
    // artifacts without dragging in a logger dependency.
    // eslint-disable-next-line no-console
    console.warn(
      JSON.stringify({
        event: "checkout_recovery_plan_slug_fallback",
        reason: telemetry.reason,
        length_bucket: telemetry.lengthBucket,
      }),
    );
  } catch {
    /* console.warn must never break the recovery flow */
  }
}

/**
 * Fire-and-forget analytics emission for every fallback (not throttled).
 * Uses the shared funnel channel so subscribers can aggregate `reason` and
 * `length_bucket` distributions without touching devtools. Carries only the
 * two non-sensitive fields the console.warn line does — no raw value, no
 * plan slug, no user identifiers.
 */
function emitFallbackAnalytics(telemetry: UnknownPlanSlugFallbackTelemetry): void {
  try {
    trackFunnelEvent("checkout_recovery_plan_slug_fallback", {
      reason: telemetry.reason,
      length_bucket: telemetry.lengthBucket,
    });
  } catch {
    /* analytics must never break the recovery flow */
  }
}

/**
 * Returns the input iff it is an exact member of the shared paid-plan
 * allowlist. Everything else — undefined, null, wrong type, unknown slug,
 * label ("Pro Monthly"), URL, Paddle price id ("pri_..."), free text —
 * collapses to the stable `"unknown_plan"` token and bumps the fallback
 * telemetry counter.
 */
export function sanitizeCheckoutRecoveryPlanSlug(value: unknown): CheckoutRecoveryPlanSlug {
  if (typeof value === "string" && PAID_PLAN_ALLOWLIST.has(value)) {
    return value as PaidPlanId;
  }
  const telemetry = classify(value);
  unknownFallbackCount += 1;
  emitFallbackWarning(telemetry);
  emitFallbackAnalytics(telemetry);
  return CHECKOUT_RECOVERY_UNKNOWN_PLAN_SLUG;
}

/** Total number of fallbacks observed since the last reset. */
export function getUnknownPlanSlugFallbackCount(): number {
  return unknownFallbackCount;
}

/**
 * Test-only reset. Clears the counter and the warn-throttle set so
 * successive test cases start from a known baseline.
 */
export function __resetCheckoutRecoveryPlanSlugTelemetryForTests(): void {
  unknownFallbackCount = 0;
  warnedReasons.clear();
}
