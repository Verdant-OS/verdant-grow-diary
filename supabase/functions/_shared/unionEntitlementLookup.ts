/**
 * _shared/unionEntitlementLookup.ts — server-side helper for the union
 * of BYO + Lovable Paddle rows.
 *
 * Pure I/O adapter around the caller-scoped Supabase client (user JWT).
 * The actual entitlement math is delegated to the shared pure resolver.
 *
 * SAFETY:
 *  - Reads only. RLS-protected select-own via the caller's JWT client.
 *  - Never uses service_role.
 *  - `expectedBillingEnvironment` is read from a narrow, whitelisted request
 *    input; it is NOT inferred from any provider fields on the row.
 *  - Environment rule (matches the DB gates has_pheno_tracker_entitlement and
 *    ai_credit_spend): an entitling environment='live' row always unlocks;
 *    sandbox rows unlock only when the server expects sandbox.
 */

// deno-lint-ignore-file no-explicit-any
import { resolveUnionEntitlements } from "../../../src/lib/entitlements/unionEntitlements.ts";
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
    (globalThis as { Deno?: { env: { get(n: string): string | undefined } } })
      .Deno?.env.get(n),
): LovableBillingEnvironment {
  const explicit = getEnv("PAYMENTS_ENVIRONMENT");
  if (explicit === "live" || explicit === "sandbox") return explicit;
  const hasLive = !!getEnv("PADDLE_LIVE_API_KEY");
  const hasSandbox = !!getEnv("PADDLE_SANDBOX_API_KEY");
  if (hasLive && !hasSandbox) return "live";
  if (hasSandbox && !hasLive) return "sandbox";
  return "sandbox";
}

/**
 * @deprecated Retained only for tests that still exercise the removed
 * client-body path. Server code MUST use `resolveServerBillingEnvironment`.
 */
export function pickExpectedBillingEnvironment(
  raw: unknown,
): LovableBillingEnvironment {
  return raw === "live" ? "live" : "sandbox";
}

const SUBSCRIPTION_COLUMNS =
  "user_id,paddle_subscription_id,paddle_customer_id,product_id,price_id,status,current_period_end,current_period_start,cancel_at_period_end,environment,created_at,updated_at";

function newestSubscriptionRow(
  supabase: any,
  environment: LovableBillingEnvironment,
) {
  return supabase
    .from("subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .eq("environment", environment)
    .order("created_at", { ascending: false })
    .limit(1);
}

function firstRowOrNull(
  res: { error: unknown; data?: unknown[] | null },
): LovableSubscriptionRow | null {
  if (res.error) return null;
  return (res.data && res.data.length > 0
    ? res.data[0]
    : null) as LovableSubscriptionRow | null;
}

function isEntitling(entitlement: ResolvedEntitlement): boolean {
  return entitlement.isActive && entitlement.effectivePlanId !== "free";
}

export async function loadUnionEntitlement(
  supabase: any,
  expectedBillingEnvironment: LovableBillingEnvironment,
  now: Date,
): Promise<{ entitlement: ResolvedEntitlement; lookupFailed: boolean }> {
  // A live-environment subscriptions row is written ONLY by the service-role
  // webhook for a signature-verified LIVE Paddle event, so it is entitling
  // regardless of what environment this server instance expects. This mirrors
  // the DB-side gates (has_pheno_tracker_entitlement, ai_credit_spend), which
  // pin their Lovable branch to environment='live'. Without it, env-config
  // drift (e.g. PAYMENTS_ENVIRONMENT left at 'sandbox' after go-live) makes
  // edge gates fail closed against legitimate Founder/Pro live rows that
  // /settings and the DB gates already honor. Sandbox rows still unlock ONLY
  // when the server explicitly expects sandbox — never the other way around.
  const wantsSandbox = expectedBillingEnvironment === "sandbox";
  const [byoRes, lovableLiveRes, lovableSandboxRes] = await Promise.all([
    supabase
      .from("billing_subscriptions")
      .select(
        "id,user_id,plan_id,status,provider,provider_customer_id,provider_subscription_id,current_period_end,cancel_at_period_end,founder_number,created_at,updated_at",
      )
      .limit(1),
    newestSubscriptionRow(supabase, "live"),
    wantsSandbox
      ? newestSubscriptionRow(supabase, "sandbox")
      : Promise.resolve({ data: [], error: null }),
  ]);

  // Fail closed on the BYO read; the Lovable reads failing degrade to null.
  if (byoRes.error) {
    return {
      lookupFailed: true,
      entitlement: resolveUnionEntitlements({
        byoRow: null,
        lovableRow: null,
        expectedBillingEnvironment,
        now,
      }),
    };
  }

  const byoRow =
    (byoRes.data && byoRes.data.length > 0 ? byoRes.data[0] : null) as
      | BillingSubscriptionRow
      | null;
  const liveRow = firstRowOrNull(lovableLiveRes);

  // The live row unlocks only when it is itself entitling (active, known
  // plan, in period, lifetime invariants). A degraded/unknown live row never
  // changes the sandbox-expected resolution below.
  const liveRowEntitles =
    liveRow != null &&
    isEntitling(
      resolveUnionEntitlements({
        byoRow: null,
        lovableRow: liveRow,
        expectedBillingEnvironment: "live",
        now,
      }),
    );

  if (!wantsSandbox || liveRowEntitles) {
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

  return {
    lookupFailed: false,
    entitlement: resolveUnionEntitlements({
      byoRow,
      lovableRow: firstRowOrNull(lovableSandboxRes),
      expectedBillingEnvironment: "sandbox",
      now,
    }),
  };
}
