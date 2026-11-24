import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { LovableSubscriptionRow } from "@/lib/entitlements/lovablePaddleAdapter";
import { SUBSCRIPTION_ROW_SCAN_LIMIT } from "@/lib/entitlements/unionEntitlements";
import {
  decideBlueprintAccess,
  serverAllowsSandboxFromEnv,
  type BlueprintAccessDecision,
} from "@/lib/blueprintAccessRules";

/**
 * getBlueprintAccess — server verdict for the Blueprint overlay.
 *
 * Reads the verified caller's own subscription rows (RLS as the user; the
 * user id comes from the verified token, never from the client) and returns
 * only an allow/deny verdict. Free/Pro callers get `allowed: false` and no
 * Blueprint data.
 */
export const getBlueprintAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BlueprintAccessDecision> => {
    const { supabase, userId } = context;
    const serverAllowsSandbox = serverAllowsSandboxFromEnv(process.env["PAYMENTS_ENVIRONMENT"]);

    const rowsFor = (environment: "live" | "sandbox") =>
      supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", userId)
        .eq("environment", environment)
        .order("created_at", { ascending: false })
        .order("paddle_subscription_id", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false })
        .limit(SUBSCRIPTION_ROW_SCAN_LIMIT);

    const [liveRes, sandboxRes] = await Promise.all([
      rowsFor("live"),
      serverAllowsSandbox ? rowsFor("sandbox") : Promise.resolve({ data: [], error: null }),
    ]);

    return decideBlueprintAccess({
      liveRows: (liveRes.data ?? []) as LovableSubscriptionRow[],
      sandboxRows: (sandboxRes.data ?? []) as LovableSubscriptionRow[],
      serverAllowsSandbox,
      lookupFailed: liveRes.error != null || sandboxRes.error != null,
      now: new Date(),
    });
  });
