/**
 * Pure access rules for the Paddle-mirror `subscriptions` table.
 *
 * Decides whether a mirrored subscription row currently grants paid
 * access. Consumers (edge functions, hooks, view models) call this
 * instead of hardcoding status checks in JSX.
 *
 * Rules (confirmed with the operator, 2026-07-16):
 *
 *   - `active` / `trialing`    → access while the reported billing period is
 *                                still current (or has no end for a valid
 *                                lifetime entitlement)
 *   - `past_due`               → access (Paddle is retrying payment;
 *                                treat as standard dunning, surface a
 *                                banner, do not revoke)
 *   - `canceled`               → access ONLY while
 *                                current_period_end is in the future
 *                                (cancel-at-period-end grace window)
 *   - `paused`                 → NO access
 *   - anything else            → NO access
 *
 * A subscription with a `scheduled_change` (cancel / pause) queued for
 * the future is NOT itself grounds for revocation — access follows the
 * current `status`, and Paddle emits a fresh `subscription.updated` /
 * `subscription.canceled` event when the scheduled change takes effect.
 *
 * This helper is DB-shape-agnostic — it accepts the minimum shape it
 * needs so both Deno edge functions and the browser bundle can import
 * it without dragging Supabase-client types.
 */

export interface SubscriptionAccessInput {
  /** Known paid plans receive stricter period-shape validation. */
  plan_id?: string | null;
  status: string;
  current_period_end?: string | Date | null;
}

const CURRENT_PERIOD_STATUSES = new Set(["active", "trialing"]);
const RECURRING_PLAN_IDS = new Set(["pro_monthly", "pro_annual"]);

/** `null` means intentionally absent; `undefined` means malformed. */
function toDateOrInvalid(value: string | Date | null | undefined): Date | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : undefined;
}

/**
 * Returns true when the row currently grants paid access.
 *
 * `now` is injectable so callers under test can pin time; production
 * callers should pass `new Date()`.
 */
export function subscriptionGrantsAccess(
  row: SubscriptionAccessInput | null | undefined,
  now: Date,
): boolean {
  if (!row) return false;
  const status = row.status;
  const end = toDateOrInvalid(row.current_period_end);

  // An invalid timestamp must never be treated like a valid no-expiry
  // lifetime row. It is neither current telemetry nor a safe entitlement.
  if (end === undefined) return false;

  // Founder lifetime rows are a separately-normalized product. Raw Paddle ID
  // prefix validation happens in the adapter/server before a row reaches this
  // helper; the access rule here still requires its exact active/no-end shape.
  if (row.plan_id === "founder_lifetime") {
    return status === "active" && end === null;
  }

  // Recurring products always carry a billing-period end. Reject a missing
  // value rather than accidentally turning a malformed row into lifetime
  // access. During dunning, that end may already be in the past.
  if (RECURRING_PLAN_IDS.has(row.plan_id ?? "")) {
    if (end === null) return false;
    if (status === "past_due") return true;
    if (CURRENT_PERIOD_STATUSES.has(status)) return end.getTime() > now.getTime();
    if (status === "canceled") return end.getTime() > now.getTime();
    return false;
  }

  // Paddle continues retrying payment during dunning. Its current period can
  // already have elapsed by then, so a period check here would contradict the
  // no-interruption policy and incorrectly revoke paid access.
  if (status === "past_due") return true;

  if (CURRENT_PERIOD_STATUSES.has(status)) {
    // `null` is valid only for a properly-normalized lifetime entitlement.
    // Recurring Paddle rows are rejected by the adapter before they reach
    // this helper when they lack an explicit period end.
    return end === null || end.getTime() > now.getTime();
  }

  if (status === "canceled") {
    // No end date on a canceled row = ended immediately. Only extend
    // access while the paid-for period is still in the future.
    return end !== null && end.getTime() > now.getTime();
  }

  // paused, expired, incomplete, or anything unrecognized → no access.
  return false;
}
