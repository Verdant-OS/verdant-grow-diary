/**
 * Pure access rules for the Paddle-mirror `subscriptions` table.
 *
 * Decides whether a mirrored subscription row currently grants paid
 * access. Consumers (edge functions, hooks, view models) call this
 * instead of hardcoding status checks in JSX.
 *
 * Rules (confirmed with the operator, 2026-07-16):
 *
 *   - `active` / `trialing`    → access
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
  status: string;
  current_period_end?: string | Date | null;
}

const GRANTS_WITHOUT_PERIOD_CHECK = new Set(['active', 'trialing', 'past_due']);

function toDateOrNull(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
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

  if (GRANTS_WITHOUT_PERIOD_CHECK.has(status)) return true;

  if (status === 'canceled') {
    const end = toDateOrNull(row.current_period_end);
    // No end date on a canceled row = ended immediately. Only extend
    // access while the paid-for period is still in the future.
    return end !== null && end.getTime() > now.getTime();
  }

  // paused, expired, incomplete, or anything unrecognized → no access.
  return false;
}
