/**
 * Stripe webhook orchestration with injected ports, so the whole decision
 * path runs in tests without a server, Stripe or a database.
 * supabase/functions/stripe-webhook/index.ts wires the real ports.
 *
 * Order (each step refuses before the next runs):
 *  1. Server environment resolved (PAYMENTS_ENVIRONMENT explicit).
 *  2. Signature verified on the exact raw body.
 *  3. Event parsed; livemode must match the environment.
 *  4. Unhandled types and non-subscription events are acknowledged, no write.
 *  5. The subscription is re-read from Stripe with a key whose mode matches.
 *  6. A row is built from that subscription; skips are acknowledged, no write.
 *  7. A row already owned by another user is never reassigned.
 *  8. Write on (environment, stripe_subscription_id). A canceled
 *     subscription is final in Stripe, so a canceled snapshot always wins and
 *     any other snapshot never overwrites a canceled row (one atomic,
 *     conditional statement, so an overlapping delivery cannot restore
 *     access after a cancellation).
 *  9. Re-read the subscription after writing. If Stripe has moved on (an
 *     overlapping delivery wrote an older snapshot after a newer one), write
 *     the newer snapshot and check again, up to MAX_WRITE_PASSES times; if it
 *     still has not settled, answer 503 so Stripe redelivers.
 *
 * Retryable failures (config, Stripe or database unavailable) answer 5xx so
 * Stripe redelivers; permanent skips answer 200 so it does not.
 */

import {
  buildStripePriceToPlanMap,
  buildStripeSubscriptionRow,
  eventLivemodeMatches,
  isHandledEventType,
  stripeRowsMatch,
  subscriptionIdFromEvent,
  verifyStripeSignature,
  type StripeRowSkip,
  type StripeSignatureRefusal,
  type StripeSubscriptionRowWrite,
} from "./stripeWebhookRules.ts";
import { keyModeMatchesEnvironment, type StripeBillingEnvironment } from "./stripeCheckoutRules.ts";

export interface StripeWebhookPorts {
  getEnv: (name: string) => string | undefined;
  resolveEnvironment: () => { ok: true; environment: StripeBillingEnvironment } | { ok: false };
  nowSeconds: () => number;
  fetchSubscription: (
    secretKey: string,
    subscriptionId: string,
  ) => Promise<{ ok: true; body: unknown } | { ok: false }>;
  /** Owner of an existing row for this key, null when none, or a failure. */
  findExistingOwner: (
    environment: StripeBillingEnvironment,
    subscriptionId: string,
  ) => Promise<{ ok: true; userId: string | null } | { ok: false }>;
  /** Insert or overwrite unconditionally. Used only for a canceled snapshot. */
  upsertRow: (row: StripeSubscriptionRowWrite) => Promise<{ ok: boolean }>;
  /**
   * Update the row for this key and user in one statement, unless it is
   * already canceled. `matched` is false when no such non-canceled row exists.
   */
  updateRowUnlessCanceled: (
    row: StripeSubscriptionRowWrite,
  ) => Promise<{ ok: true; matched: boolean } | { ok: false }>;
  /** Insert the row, doing nothing when a row for this key already exists. */
  insertRowIfAbsent: (row: StripeSubscriptionRowWrite) => Promise<{ ok: boolean }>;
  log: (fields: Record<string, string>) => void;
}

export type StripeWebhookOutcome =
  | "recorded"
  | "ignored_event_type"
  | "ignored_not_subscription"
  | `skipped_${StripeRowSkip}`
  | "skipped_identity_conflict"
  | `rejected_${StripeSignatureRefusal}`
  | "rejected_bad_json"
  | "rejected_livemode_mismatch"
  | "environment_unavailable"
  | "secret_key_unavailable"
  | "stripe_unavailable"
  | "database_unavailable"
  | "snapshot_unsettled";

export interface StripeWebhookResult {
  status: number;
  outcome: StripeWebhookOutcome;
}

function done(
  ports: StripeWebhookPorts,
  status: number,
  outcome: StripeWebhookOutcome,
  environment?: StripeBillingEnvironment,
): StripeWebhookResult {
  try {
    ports.log({
      event: "stripe_webhook",
      outcome,
      environment: environment ?? "(unresolved)",
    });
  } catch {
    // Telemetry must never change the answer.
  }
  return { status, outcome };
}

export async function processStripeWebhook(
  request: { rawBody: string; signatureHeader: string | null },
  ports: StripeWebhookPorts,
): Promise<StripeWebhookResult> {
  const resolution = ports.resolveEnvironment();
  if (!resolution.ok) return done(ports, 503, "environment_unavailable");
  const environment = resolution.environment;

  const signature = await verifyStripeSignature({
    rawBody: request.rawBody,
    header: request.signatureHeader,
    secret: ports.getEnv("STRIPE_WEBHOOK_SECRET"),
    nowSeconds: ports.nowSeconds(),
  });
  if (!signature.ok) {
    // A missing secret is our configuration, so Stripe should retry later.
    const status = signature.reason === "secret_missing" ? 503 : 400;
    return done(ports, status, `rejected_${signature.reason}`, environment);
  }

  let event: unknown;
  try {
    event = JSON.parse(request.rawBody);
  } catch {
    return done(ports, 400, "rejected_bad_json", environment);
  }
  if (!eventLivemodeMatches(event, environment)) {
    return done(ports, 400, "rejected_livemode_mismatch", environment);
  }
  if (!isHandledEventType((event as { type?: unknown }).type)) {
    return done(ports, 200, "ignored_event_type", environment);
  }
  const subscriptionId = subscriptionIdFromEvent(event);
  if (subscriptionId === null) return done(ports, 200, "ignored_not_subscription", environment);

  const secretKey = (ports.getEnv("STRIPE_SECRET_KEY") ?? "").trim();
  if (!keyModeMatchesEnvironment(secretKey, environment)) {
    return done(ports, 503, "secret_key_unavailable", environment);
  }
  const fetched = await ports.fetchSubscription(secretKey, subscriptionId);
  if (!fetched.ok) return done(ports, 502, "stripe_unavailable", environment);

  const built = buildStripeSubscriptionRow({
    subscription: fetched.body,
    environment,
    priceToPlan: buildStripePriceToPlanMap(environment, ports.getEnv),
  });
  if (!built.ok) return done(ports, 200, `skipped_${built.reason}`, environment);

  let row = built.row;
  for (let pass = 1; pass <= MAX_WRITE_PASSES; pass++) {
    const owner = await ports.findExistingOwner(environment, row.stripe_subscription_id);
    if (!owner.ok) return done(ports, 500, "database_unavailable", environment);
    if (owner.userId !== null && owner.userId.toLowerCase() !== row.user_id) {
      return done(ports, 200, "skipped_identity_conflict", environment);
    }
    if (!(await writeRow(ports, row))) {
      return done(ports, 500, "database_unavailable", environment);
    }

    const reread = await ports.fetchSubscription(secretKey, subscriptionId);
    if (!reread.ok) return done(ports, 502, "stripe_unavailable", environment);
    const rebuilt = buildStripeSubscriptionRow({
      subscription: reread.body,
      environment,
      priceToPlan: buildStripePriceToPlanMap(environment, ports.getEnv),
    });
    // Nothing newer to write: settled, or Stripe now holds a state this
    // webhook never records (that later event will arrive on its own).
    if (!rebuilt.ok || stripeRowsMatch(rebuilt.row, row)) {
      return done(ports, 200, "recorded", environment);
    }
    row = rebuilt.row;
  }
  return done(ports, 503, "snapshot_unsettled", environment);
}

/** Write passes per delivery before asking Stripe to redeliver. */
export const MAX_WRITE_PASSES = 3;

/**
 * Canceled is final in Stripe, so it always wins. Any other snapshot updates
 * the row only while it is not canceled, then inserts if no row exists; both
 * are single statements, so a stale snapshot can never undo a cancellation.
 */
async function writeRow(
  ports: StripeWebhookPorts,
  row: StripeSubscriptionRowWrite,
): Promise<boolean> {
  if (row.status === "canceled") return (await ports.upsertRow(row)).ok;
  const updated = await ports.updateRowUnlessCanceled(row);
  if (!updated.ok) return false;
  if (updated.matched) return true;
  return (await ports.insertRowIfAbsent(row)).ok;
}
