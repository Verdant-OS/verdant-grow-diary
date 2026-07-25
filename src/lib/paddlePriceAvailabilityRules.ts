/**
 * paddlePriceAvailabilityRules — classify a get-paddle-price failure as a
 * PLAN-AVAILABILITY condition vs a genuine transport/unexpected failure.
 *
 * Why this exists: a plan whose Paddle price is missing, unconfigured, or sold
 * out is not an error the grower caused or can retry away — it is that plan
 * being unbuyable right now. Surfacing it as a destructive "something went
 * wrong" toast (and, worse, leaking the internal plan id) misrepresents a
 * configuration state as a fault.
 *
 * Deliberately PLAN-AGNOSTIC. It would be easy to special-case one tier that
 * happens to be unconfigured today, but the same condition applies to any plan
 * whose env var is unset or whose Paddle catalog entry is missing — including
 * one we very much are selling. A tier-specific branch would go stale the day
 * that tier ships and would leave every other plan unprotected.
 *
 * Honest-copy fence: this module never claims a plan is "coming soon". The app
 * knows only that a price did not resolve; it cannot distinguish "not launched
 * yet" from "someone rotated a secret". Intent is a product decision and must
 * be stated deliberately elsewhere, never inferred from a failed lookup.
 */

/** Server error codes that mean "this plan is not purchasable right now". */
const UNAVAILABLE_CODES: ReadonlySet<string> = new Set([
  // Env var unset, catalog lookup failed, or the gateway returned something
  // unusable. All resolve to: we cannot quote a price for this plan.
  "price_resolution_unavailable",
  // The plan id is not in the server allow-list — it is marketed but not wired.
  "unknown_plan",
  // A configured plan whose Paddle price id is missing/empty.
  "price_not_configured",
  // Deliberately capped plan (e.g. founder seats) with none remaining.
  "plan_sold_out",
]);

export type PaddlePriceFailure =
  | { kind: "unavailable"; code: string; message: string }
  | { kind: "unexpected" };

/** Grower-facing copy. No plan ids, no internal codes, no blame, no promises. */
export const PLAN_UNAVAILABLE_MESSAGE =
  "This plan isn't available to purchase right now. Nothing was charged. " +
  "Other plans are unaffected — please try again later or pick a different plan.";

export const PLAN_SOLD_OUT_MESSAGE =
  "This plan is fully subscribed right now. Nothing was charged. " + "Other plans are unaffected.";

/**
 * Pull our discriminating `error` code out of a supabase.functions.invoke
 * failure. Non-2xx surfaces as FunctionsHttpError with the response body on
 * `error.context`, which may arrive already-parsed or as a JSON string.
 * Mirrors the extraction in src/lib/customerPortal.ts.
 */
export function extractFunctionErrorCode(error: unknown): string | null {
  const ctx = (error as { context?: { body?: unknown } } | null)?.context;
  const body = ctx?.body;
  if (typeof body === "string") {
    try {
      return (JSON.parse(body) as { error?: string })?.error ?? null;
    } catch {
      return null;
    }
  }
  if (body && typeof body === "object") {
    return (body as { error?: string }).error ?? null;
  }
  return null;
}

/**
 * Classify a price-resolution failure.
 *
 * `invokeError` is the error from functions.invoke (may be null when the call
 * succeeded but returned no usable price); `data` is the response body when one
 * was parsed. A 2xx response carrying an `error` code is honoured too, so the
 * classification does not depend on the transport status alone.
 *
 * Fails OPEN to "unexpected": an unrecognised code keeps today's louder
 * treatment rather than being quietly reclassified as a benign, expected state.
 */
export function classifyPaddlePriceFailure(input: {
  invokeError: unknown;
  data?: { paddleId?: unknown; error?: unknown } | null;
}): PaddlePriceFailure {
  const bodyCode =
    extractFunctionErrorCode(input.invokeError) ??
    (typeof input.data?.error === "string" ? input.data.error : null);

  if (bodyCode && UNAVAILABLE_CODES.has(bodyCode)) {
    return {
      kind: "unavailable",
      code: bodyCode,
      message: bodyCode === "plan_sold_out" ? PLAN_SOLD_OUT_MESSAGE : PLAN_UNAVAILABLE_MESSAGE,
    };
  }
  return { kind: "unexpected" };
}
