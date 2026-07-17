/**
 * paddleCancelNoticePresenter — PURE, PRESENTATION-ONLY.
 *
 * Given a subscription row (public.subscriptions), decide whether the
 * Settings page should show a "your subscription will end on <date>"
 * notice. This is a display concern only — it never mutates access,
 * never touches entitlement rules, and never re-evaluates
 * has_active_subscription. Access continues to be gated by
 * `src/lib/paddleSubscriptionAccessRules.ts` (unchanged).
 *
 * The notice is visible when the row shows an in-flight cancel schedule:
 *   - `cancel_at_period_end === true`, OR
 *   - `scheduled_change_action === 'cancel'`
 *
 * "Until" date preference (all defensive against nulls / bad ISO):
 *   1. scheduled_change_at   (Paddle's authoritative scheduled effective time)
 *   2. current_period_end    (fallback — end of the paid period)
 *
 * Never fires for lifetime pseudo-rows (`lifetime_%` id shape) — those are
 * one-time purchases with no cancel semantics.
 */

export interface PaddleCancelNoticeInput {
  paddle_subscription_id?: string | null;
  status?: string | null;
  cancel_at_period_end?: boolean | null;
  scheduled_change_action?: string | null;
  scheduled_change_at?: string | null;
  current_period_end?: string | null;
}

export interface PaddleCancelNotice {
  visible: boolean;
  /** ISO string when access will end; null if unknown. */
  accessUntilIso: string | null;
  /** Formatted for display in the app's locale/timezone; empty when hidden. */
  accessUntilLabel: string;
  /** Why the notice is showing (or null when hidden). */
  reason: null | 'cancel_at_period_end' | 'scheduled_change_cancel';
}

function isCancelIntent(row: PaddleCancelNoticeInput): PaddleCancelNotice['reason'] {
  if (row.scheduled_change_action === 'cancel') return 'scheduled_change_cancel';
  if (row.cancel_at_period_end === true) return 'cancel_at_period_end';
  return null;
}

function safeDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(d: Date, locale?: string): string {
  try {
    return d.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

const HIDDEN: PaddleCancelNotice = {
  visible: false,
  accessUntilIso: null,
  accessUntilLabel: '',
  reason: null,
};

export function derivePaddleCancelNotice(
  row: PaddleCancelNoticeInput | null | undefined,
  locale?: string,
): PaddleCancelNotice {
  if (!row) return HIDDEN;
  // Lifetime pseudo-rows never have cancel semantics.
  if (typeof row.paddle_subscription_id === 'string' &&
      row.paddle_subscription_id.startsWith('lifetime_')) {
    return HIDDEN;
  }
  // Already canceled + past-end rows: the entitlement resolver already
  // shows "Canceled — access continues until…". Don't double up when the
  // row is already fully canceled AND the period has ended.
  const reason = isCancelIntent(row);
  if (!reason) return HIDDEN;

  const scheduledAt = safeDate(row.scheduled_change_at);
  const periodEnd = safeDate(row.current_period_end);
  const until = scheduledAt ?? periodEnd;
  if (!until) {
    // We know cancel is scheduled but have no date to show — still surface
    // the notice so the grower isn't left wondering, just without a date.
    return {
      visible: true,
      accessUntilIso: null,
      accessUntilLabel: '',
      reason,
    };
  }
  return {
    visible: true,
    accessUntilIso: until.toISOString(),
    accessUntilLabel: formatDate(until, locale),
    reason,
  };
}
