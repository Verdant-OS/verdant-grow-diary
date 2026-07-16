/**
 * delete-account — self-serve account deletion.
 *
 * Contract:
 *   - Requires a verified caller JWT (auth.getUser).
 *   - Requires POST body { confirm: "DELETE" } — a client-side typed
 *     confirmation prevents accidental fetches from destroying an account.
 *   - Uses service_role ONLY after the JWT check.
 *   - Cancels every recurring Paddle subscription immediately before data
 *     deletion. If Paddle cannot confirm cancellation, deletion fails closed.
 *   - Removes owner-prefixed Storage objects through the Storage API before
 *     auth.admin.deleteUser(uid); owned database rows then cascade.
 *   - Revokes refresh tokens using the verified caller JWT, never a client
 *     supplied user id.
 *   - Never accepts a target user_id from the body — the caller can only
 *     delete themselves.
 *   - Returns { ok: true } on success; never echoes the deleted uid.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getPaddleClient } from "../_shared/paddle.ts";
import {
  compileAccountSubscriptions,
  executeAccountDeletion,
  isPaddleEnvironment,
  type CanonicalSubscriptionRow,
  type LegacyBillingSubscriptionRow,
} from "./accountDeletionWorkflow.ts";
import { deleteOwnedStorage as cleanupOwnedStorage } from "./ownedStorageCleanup.ts";

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(401, { error: "auth_required" });

    let body: { confirm?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "bad_request" });
    }
    if (body?.confirm !== "DELETE") return json(400, { error: "confirmation_required" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json(503, { error: "unavailable" });
    }

    const authed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await authed.auth.getUser();
    if (userError || !userData?.user) return json(401, { error: "auth_required" });
    const uid = userData.user.id;
    const accessToken = authHeader.slice("Bearer ".length).trim();

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const result = await executeAccountDeletion(
      { userId: uid, accessToken },
      {
        async loadSubscriptions(userId) {
          const [canonical, legacy] = await Promise.all([
            admin
              .from("subscriptions")
              .select("paddle_subscription_id,paddle_customer_id,environment,status")
              .eq("user_id", userId),
            admin
              .from("billing_subscriptions")
              .select(
                "id,plan_id,status,provider,provider_customer_id,provider_subscription_id",
              )
              .eq("user_id", userId),
          ]);
          if (
            canonical.error ||
            legacy.error ||
            !Array.isArray(canonical.data) ||
            !Array.isArray(legacy.data)
          ) {
            return { ok: false };
          }

          const canonicalRows: CanonicalSubscriptionRow[] = [];
          for (const row of canonical.data) {
            if (!isPaddleEnvironment(row.environment)) return { ok: false };
            canonicalRows.push({
              paddle_subscription_id: String(row.paddle_subscription_id ?? ""),
              paddle_customer_id: String(row.paddle_customer_id ?? ""),
              environment: row.environment,
              status: String(row.status ?? ""),
            });
          }
          const legacyRows: LegacyBillingSubscriptionRow[] = legacy.data.map((row) => ({
            id: String(row.id ?? ""),
            plan_id: String(row.plan_id ?? ""),
            status: String(row.status ?? ""),
            provider: typeof row.provider === "string" ? row.provider : null,
            provider_customer_id:
              typeof row.provider_customer_id === "string" ? row.provider_customer_id : null,
            provider_subscription_id:
              typeof row.provider_subscription_id === "string"
                ? row.provider_subscription_id
                : null,
          }));
          return compileAccountSubscriptions(canonicalRows, legacyRows);
        },
        async cancelSubscriptionImmediately(subscription) {
          try {
            const paddle = getPaddleClient(subscription.environment);
            await paddle.subscriptions.cancel(subscription.paddle_subscription_id, {
              effectiveFrom: "immediately",
            });
            return { ok: true };
          } catch {
            console.error("delete-account billing cancellation failed");
            return { ok: false };
          }
        },
        async deletePaddleCustomerMirrors(customerIds) {
          const { error } = await admin
            .from("paddle_customers")
            .delete()
            .in("paddle_customer_id", [...customerIds]);
          return error ? { ok: false } : { ok: true };
        },
        async deleteOwnedStorage(userId) {
          const cleanup = await cleanupOwnedStorage(admin.storage, userId);
          return cleanup.ok ? { ok: true } : { ok: false };
        },
        async revokeSessions(jwt) {
          try {
            const { error } = await admin.auth.admin.signOut(jwt, "global");
            return error ? { ok: false } : { ok: true };
          } catch {
            return { ok: false };
          }
        },
        async deleteAuthUser(userId) {
          const { error } = await admin.auth.admin.deleteUser(userId);
          return error ? { ok: false } : { ok: true };
        },
      },
    );

    if (!result.ok) {
      const status = result.error === "billing_cancellation_failed" ? 409 : 500;
      console.error(`delete-account ${result.error}`);
      return json(status, { error: result.error });
    }
    return json(200, { ok: true });
  } catch (e) {
    console.error("delete-account error", String(e));
    return json(503, { error: "unavailable" });
  }
});
