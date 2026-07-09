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
 */

// deno-lint-ignore-file no-explicit-any
import { resolveUnionEntitlements } from "../../../src/lib/entitlements/unionEntitlements.ts";
import type { BillingSubscriptionRow } from "../../../src/lib/entitlements/types.ts";
import type {
  LovableBillingEnvironment,
  LovableSubscriptionRow,
} from "../../../src/lib/entitlements/lovablePaddleAdapter.ts";
import type { ResolvedEntitlement } from "../../../src/lib/entitlements/types.ts";

export function pickExpectedBillingEnvironment(
  raw: unknown,
): LovableBillingEnvironment {
  return raw === "live" ? "live" : "sandbox";
}

export async function loadUnionEntitlement(
  supabase: any,
  expectedBillingEnvironment: LovableBillingEnvironment,
  now: Date,
): Promise<{ entitlement: ResolvedEntitlement; lookupFailed: boolean }> {
  const [byoRes, lovableRes] = await Promise.all([
    supabase
      .from("billing_subscriptions")
      .select(
        "id,user_id,plan_id,status,provider,provider_customer_id,provider_subscription_id,current_period_end,cancel_at_period_end,founder_number,created_at,updated_at",
      )
      .limit(1),
    supabase
      .from("subscriptions")
      .select(
        "user_id,paddle_subscription_id,paddle_customer_id,product_id,price_id,status,current_period_end,current_period_start,cancel_at_period_end,environment,created_at,updated_at",
      )
      .eq("environment", expectedBillingEnvironment)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  // Fail closed on the BYO read; the Lovable read failing degrades to null.
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
  const lovableRow = lovableRes.error
    ? null
    : ((lovableRes.data && lovableRes.data.length > 0
      ? lovableRes.data[0]
      : null) as LovableSubscriptionRow | null);

  return {
    lookupFailed: false,
    entitlement: resolveUnionEntitlements({
      byoRow,
      lovableRow,
      expectedBillingEnvironment,
      now,
    }),
  };
}
