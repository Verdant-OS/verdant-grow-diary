/**
 * _shared/unionEntitlementLookup.ts — server-side entitlement helper.
 *
 * Reads ONLY from public.subscriptions (the canonical Lovable Paddle lane).
 * The legacy BYO branch (public.billing_subscriptions) was retired in the
 * 2026-07-16 canonical-lane reconciliation slice; the DB-side gates
 * has_pheno_tracker_entitlement and ai_credit_spend were narrowed in the
 * same migration. Any currently-entitling BYO row was backfilled into
 * public.subscriptions in that migration, so no live entitlement was lost.
 *
 * The export names ("loadUnionEntitlement", "resolveUnionEntitlements",
 * pickStrongestBilling) are retained for call-site stability — they still
 * accept a nullable byoRow so the pure resolver contract is unchanged, but
 * this helper always passes `byoRow: null`.
 *
 * SAFETY:
 *  - Reads only. RLS-protected select-own via the caller's JWT client.
 *  - Never uses service_role.
 *  - `expectedBillingEnvironment` is resolved server-side; it is NOT trusted
 *    from request input or inferred from provider fields on the row.
 *  - Environment rule (matches the DB gates): an entitling environment='live'
 *    row always unlocks; sandbox rows unlock only when the server expects
 *    sandbox.
 */

// deno-lint-ignore-file no-explicit-any
import {
  resolveUnionEntitlements,
  pickEntitlingLovableRow,
  lovableRowEntitles,
  SUBSCRIPTION_ROW_SCAN_LIMIT,
} from "../../../src/lib/entitlements/unionEntitlements.ts";
import type { BillingSubscriptionRow } from "../../../src/lib/entitlements/types.ts";
import type {
  LovableBillingEnvironment,
  LovableSubscriptionRow,
} from "../../../src/lib/entitlements/lovablePaddleAdapter.ts";
import type { ResolvedEntitlement } from "../../../src/lib/entitlements/types.ts";

/**
 * Server-authoritative billing environment resolver.
 *
 * Trust order:
 *   1. Explicit `PAYMENTS_ENVIRONMENT` env var (`live` | `sandbox`).
 *   2. Presence of exactly one of PADDLE_LIVE_API_KEY / PADDLE_SANDBOX_API_KEY.
 *   3. Conservative default: `sandbox` (never overgrants live).
 *
 * IMPORTANT: never derived from request body / query. Any caller-provided
 * `billing_env` is ignored — a spoofed body cannot flip the server's
 * expected environment.
 */
export function resolveServerBillingEnvironment(
  getEnv: (name: string) => string | undefined = (n) =>
    (globalThis as { Deno?: { env: { get(n: string): string | undefined } } }).Deno?.env.get(n),
): LovableBillingEnvironment {
  const explicit = getEnv("PAYMENTS_ENVIRONMENT");
  if (explicit === "live" || explicit === "sandbox") return explicit;
  const hasLive = !!getEnv("PADDLE_LIVE_API_KEY");
  const hasSandbox = !!getEnv("PADDLE_SANDBOX_API_KEY");
  if (hasLive && !hasSandbox) return "live";
  if (hasSandbox && !hasLive) return "sandbox";
  return "sandbox";
}

export type RequiredServerBillingEnvironmentResolution =
  | { ok: true; environment: LovableBillingEnvironment }
  | {
      ok: false;
      reason:
        | "payments_environment_missing"
        | "payments_environment_invalid"
        | "paddle_key_configuration_ambiguous";
    };

/**
 * Strict environment resolver for cost-bearing AI calls.
 *
 * Unlike the compatibility resolver above, this helper never infers sandbox
 * from Paddle-key presence. AI provider spend is allowed only when
 * PAYMENTS_ENVIRONMENT is explicitly `live` or `sandbox`. If it is absent,
 * both/neither key configurations are reported as ambiguous instead of
 * silently becoming sandbox.
 */
export function resolveRequiredServerBillingEnvironment(
  getEnv: (name: string) => string | undefined = (n) =>
    (globalThis as { Deno?: { env: { get(n: string): string | undefined } } }).Deno?.env.get(n),
): RequiredServerBillingEnvironmentResolution {
  const explicit = getEnv("PAYMENTS_ENVIRONMENT");
  if (explicit === "live" || explicit === "sandbox") {
    return { ok: true, environment: explicit };
  }
  if (explicit !== undefined && explicit !== "") {
    return { ok: false, reason: "payments_environment_invalid" };
  }

  const hasLive = (getEnv("PADDLE_LIVE_API_KEY") ?? "").trim() !== "";
  const hasSandbox = (getEnv("PADDLE_SANDBOX_API_KEY") ?? "").trim() !== "";
  if (hasLive === hasSandbox) {
    return { ok: false, reason: "paddle_key_configuration_ambiguous" };
  }
  return { ok: false, reason: "payments_environment_missing" };
}

/**
 * @deprecated Retained only for tests that still exercise the removed
 * client-body path. Server code MUST use `resolveServerBillingEnvironment`.
 */
export function pickExpectedBillingEnvironment(raw: unknown): LovableBillingEnvironment {
  return raw === "live" ? "live" : "sandbox";
}

const SUBSCRIPTION_COLUMNS =
  "user_id,paddle_subscription_id,paddle_customer_id,product_id,price_id,status,current_period_end,current_period_start,cancel_at_period_end,environment,created_at,updated_at";

// Bounded newest-first window + any-entitling-row selection semantics are
// shared with the client hook via pickEntitlingLovableRow /
// SUBSCRIPTION_ROW_SCAN_LIMIT in src/lib/entitlements/unionEntitlements.ts
// (window rationale documented there). created_at is not unique;
// paddle_subscription_id is — without the tiebreak, equal timestamps make
// the window order (and therefore the picked row) nondeterministic.
function newestSubscriptionRows(supabase: any, environment: LovableBillingEnvironment) {
  return supabase
    .from("subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .eq("environment", environment)
    .order("created_at", { ascending: false })
    .order("paddle_subscription_id", { ascending: false })
    .limit(SUBSCRIPTION_ROW_SCAN_LIMIT);
}

function rowsOrEmpty(res: { error: unknown; data?: unknown[] | null }): LovableSubscriptionRow[] {
  if (res.error) return [];
  return (res.data ?? []) as LovableSubscriptionRow[];
}

export async function loadUnionEntitlement(
  supabase: any,
  expectedBillingEnvironment: LovableBillingEnvironment,
  now: Date,
): Promise<{ entitlement: ResolvedEntitlement; lookupFailed: boolean }> {
  // Canonical lane (2026-07-16): read only from public.subscriptions.
  // A live-environment row is written ONLY by the service-role webhook for a
  // signature-verified LIVE Paddle event, so it is entitling regardless of
  // what environment this server instance expects. Sandbox rows unlock ONLY
  // when the server explicitly expects sandbox.
  const wantsSandbox = expectedBillingEnvironment === "sandbox";
  const [lovableLiveRes, lovableSandboxRes] = await Promise.all([
    newestSubscriptionRows(supabase, "live"),
    wantsSandbox
      ? newestSubscriptionRows(supabase, "sandbox")
      : Promise.resolve({ data: [], error: null }),
  ]);

  const byoRow: BillingSubscriptionRow | null = null;
  const liveRow = pickEntitlingLovableRow(rowsOrEmpty(lovableLiveRes), "live", now);
  const liveRowEntitles = liveRow != null && lovableRowEntitles(liveRow, "live", now);

  // A successfully resolved paid row is sufficient proof of access even if
  // the lower-precedence environment read failed. Otherwise any relevant
  // query error means the plan could not be verified and must not be
  // misreported as a confirmed Free/upgrade-required result.
  if (liveRowEntitles) {
    return {
      lookupFailed: false,
      entitlement: resolveUnionEntitlements({
        byoRow,
        lovableRow: liveRow,
        expectedBillingEnvironment: "live",
        now,
      }),
    };
  }

  const sandboxRow = wantsSandbox
    ? pickEntitlingLovableRow(rowsOrEmpty(lovableSandboxRes), "sandbox", now)
    : null;
  const sandboxRowEntitles =
    sandboxRow != null && lovableRowEntitles(sandboxRow, "sandbox", now);

  if (wantsSandbox && sandboxRowEntitles) {
    return {
      lookupFailed: false,
      entitlement: resolveUnionEntitlements({
        byoRow,
        lovableRow: sandboxRow,
        expectedBillingEnvironment: "sandbox",
        now,
      }),
    };
  }

  const lookupFailed =
    lovableLiveRes.error != null || (wantsSandbox && lovableSandboxRes.error != null);
  const fallbackEnvironment = wantsSandbox ? "sandbox" : "live";
  const fallbackRow = wantsSandbox ? sandboxRow : liveRow;

  return {
    lookupFailed,
    entitlement: resolveUnionEntitlements({
      byoRow,
      lovableRow: fallbackRow,
      expectedBillingEnvironment: fallbackEnvironment,
      now,
    }),
  };
}
