/**
 * Pure account-deletion workflow.
 *
 * Billing is stopped before any local data is removed. Every boundary fails
 * closed: a provider, storage, session-revocation, or Auth failure leaves the
 * Auth user in place so the grower can retry or contact support.
 */

export type PaddleEnvironment = "sandbox" | "live";

export interface RecurringSubscription {
  paddle_subscription_id: string;
  paddle_customer_id: string;
  environment: PaddleEnvironment;
  status: string;
}

export interface CanonicalSubscriptionRow extends RecurringSubscription {}

export interface LegacyBillingSubscriptionRow {
  id: string;
  plan_id: string;
  status: string;
  provider: string | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
}

export type StepResult = { ok: true } | { ok: false };
export type LoadSubscriptionsResult =
  { ok: true; rows: readonly RecurringSubscription[] } | { ok: false };

export interface AccountDeletionDependencies {
  loadSubscriptions(userId: string): Promise<LoadSubscriptionsResult>;
  cancelSubscriptionImmediately(subscription: RecurringSubscription): Promise<StepResult>;
  deletePaddleCustomerMirrors(customerIds: readonly string[]): Promise<StepResult>;
  deleteOwnedStorage(userId: string): Promise<StepResult>;
  revokeSessions(accessToken: string): Promise<StepResult>;
  deleteAuthUser(userId: string): Promise<StepResult>;
}

export type AccountDeletionFailure =
  | "billing_cancellation_failed"
  | "storage_cleanup_failed"
  | "session_revoke_failed"
  | "delete_failed";

export type AccountDeletionWorkflowResult =
  { ok: true } | { ok: false; error: AccountDeletionFailure };

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isPaddleEnvironment(value: unknown): value is PaddleEnvironment {
  return value === "sandbox" || value === "live";
}

/** Lifetime purchases and already-canceled rows cannot bill again. */
export function needsImmediateCancellation(subscription: RecurringSubscription): boolean {
  return (
    !subscription.paddle_subscription_id.startsWith("lifetime_") &&
    subscription.status !== "canceled" &&
    subscription.status !== "expired"
  );
}

function isValidSubscription(subscription: RecurringSubscription): boolean {
  return (
    isNonEmpty(subscription.paddle_subscription_id) &&
    isNonEmpty(subscription.status) &&
    isPaddleEnvironment(subscription.environment)
  );
}

function legacySyntheticIds(row: LegacyBillingSubscriptionRow): readonly string[] {
  return [`byo_backfill_${row.id}`, `lifetime_byo_backfill_${row.id}`];
}

/**
 * Reconciles the canonical Lovable lane with the retired BYO audit lane.
 * Canonical `byo_backfill_*` ids are synthetic and must never be sent to
 * Paddle; their real provider ids remain on billing_subscriptions.
 */
export function compileAccountSubscriptions(
  canonicalRows: readonly CanonicalSubscriptionRow[],
  legacyRows: readonly LegacyBillingSubscriptionRow[],
): LoadSubscriptionsResult {
  const legacySynthetic = new Set(legacyRows.flatMap(legacySyntheticIds));
  const compiled: RecurringSubscription[] = [];

  for (const row of canonicalRows) {
    if (
      row.paddle_subscription_id.startsWith("byo_backfill_") ||
      row.paddle_subscription_id.startsWith("lifetime_byo_backfill_")
    ) {
      if (!legacySynthetic.has(row.paddle_subscription_id)) return { ok: false };
      continue;
    }
    compiled.push(row);
  }

  for (const row of legacyRows) {
    if (row.plan_id === "free" || row.plan_id === "founder_lifetime") continue;

    const canBillAgain = row.status !== "canceled" && row.status !== "expired";
    if (!canBillAgain) continue;

    // The retired BYO webhook was sandbox-only. Anything other than a
    // complete Paddle link cannot be safely canceled and therefore blocks
    // destructive deletion for operator resolution.
    if (
      row.provider !== "paddle" ||
      !isNonEmpty(row.provider_subscription_id)
    ) {
      return { ok: false };
    }
    compiled.push({
      paddle_subscription_id: row.provider_subscription_id,
      paddle_customer_id: row.provider_customer_id ?? "",
      environment: "sandbox",
      status: row.status,
    });
  }

  // A subscription can exist in both lanes during reconciliation. Cancel it
  // exactly once so a successful first cancellation cannot make a duplicate
  // request fail the otherwise-safe deletion.
  const unique = new Map<string, RecurringSubscription>();
  for (const row of compiled) {
    const key = `${row.environment}:${row.paddle_subscription_id}`;
    const existing = unique.get(key);
    unique.set(key, {
      ...row,
      paddle_customer_id: existing?.paddle_customer_id || row.paddle_customer_id,
    });
  }

  return { ok: true, rows: [...unique.values()] };
}

export async function executeAccountDeletion(
  input: { userId: string; accessToken: string },
  deps: AccountDeletionDependencies,
): Promise<AccountDeletionWorkflowResult> {
  const loaded = await deps.loadSubscriptions(input.userId);
  if (!loaded.ok || loaded.rows.some((row) => !isValidSubscription(row))) {
    return { ok: false, error: "billing_cancellation_failed" };
  }

  // Stable order makes retries and operator traces deterministic.
  const recurring = loaded.rows
    .filter(needsImmediateCancellation)
    .slice()
    .sort((a, b) => a.paddle_subscription_id.localeCompare(b.paddle_subscription_id));

  for (const subscription of recurring) {
    const canceled = await deps.cancelSubscriptionImmediately(subscription);
    if (!canceled.ok) {
      return { ok: false, error: "billing_cancellation_failed" };
    }
  }

  const customerIds = Array.from(
    new Set(
      loaded.rows
        .map((row) => row.paddle_customer_id)
        .filter((customerId) => isNonEmpty(customerId)),
    ),
  ).sort();
  if (customerIds.length > 0) {
    const mirrorDelete = await deps.deletePaddleCustomerMirrors(customerIds);
    if (!mirrorDelete.ok) {
      return { ok: false, error: "delete_failed" };
    }
  }

  const revoked = await deps.revokeSessions(input.accessToken);
  if (!revoked.ok) {
    return { ok: false, error: "session_revoke_failed" };
  }

  const storage = await deps.deleteOwnedStorage(input.userId);
  if (!storage.ok) {
    return { ok: false, error: "storage_cleanup_failed" };
  }

  const deleted = await deps.deleteAuthUser(input.userId);
  if (!deleted.ok) return { ok: false, error: "delete_failed" };

  return { ok: true };
}
