/**
 * Lovable built-in Paddle webhook sink (Phase 2a + reliability patch).
 *
 * Thin transport wrapper around the pure `handleVerifiedEvent`
 * orchestrator. All lifecycle / duplicate / failure semantics live in
 * orchestrator.ts and are unit-tested there.
 *
 * Response contract (see orchestrator.ts for the full state machine):
 *   - non-POST                        → 405
 *   - bad env query param             → 400
 *   - invalid Paddle signature        → 400
 *   - event durably recorded + write  → 200
 *   - duplicate already processed     → 200 (no-op)
 *   - duplicate previously failed     → reprocess, 200/500 per result
 *   - any DB failure before durable
 *     success                         → 500 so Paddle retries
 *
 * Does NOT touch entitlements, gates, or the BYO paddle-webhook stack.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyWebhook, getPaddleClient, type PaddleEnv } from "../_shared/paddle.ts";
import { handleVerifiedEvent, type Deps, type EventLikeWithId } from "./orchestrator.ts";

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
  }
  return _supabase;
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return { _raw: s.slice(0, 4000) };
  }
}

function buildDeps(): Deps {
  const sb = getSupabase();
  return {
    async insertEventReceived({ paddle_event_id, audit, payload }) {
      const { error } = await sb.from("lovable_paddle_events").insert({
        paddle_event_id,
        event_type: audit.event_type,
        environment: audit.environment,
        user_id: audit.user_id,
        paddle_subscription_id: audit.paddle_subscription_id,
        paddle_transaction_id: audit.paddle_transaction_id,
        price_external_id: audit.price_external_id,
        product_external_id: audit.product_external_id,
        processing_status: "received",
        processed_ok: false,
        skip_reason: null,
        last_error: null,
        payload,
      });
      if (!error) return { ok: true };
      // 23505 = unique_violation on paddle_event_id → duplicate delivery.
      if ((error as { code?: string }).code === "23505") {
        return { ok: true, duplicate: true };
      }
      return { ok: false, error: error.message };
    },
    async getExistingEvent(paddle_event_id) {
      const { data, error } = await sb
        .from("lovable_paddle_events")
        .select("processing_status")
        .eq("paddle_event_id", paddle_event_id)
        .maybeSingle();
      if (error) return { ok: false, error: error.message };
      return {
        ok: true,
        row: (data ?? null) as {
          processing_status: "received" | "processed" | "skipped" | "failed";
        } | null,
      };
    },
    async upsertSubscription(row) {
      const { error } = await sb
        .from("subscriptions")
        .upsert(row, { onConflict: "paddle_subscription_id" });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
    async updateSubscription(paddle_subscription_id, patch, env) {
      const { error } = await sb
        .from("subscriptions")
        .update(patch)
        .eq("paddle_subscription_id", paddle_subscription_id)
        .eq("environment", env);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
    async upsertCustomer(row) {
      // Mirror-only. paddle_customer_id is the natural unique key.
      const { error } = await sb
        .from("paddle_customers")
        .upsert(row, { onConflict: "paddle_customer_id" });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
    async markEvent(paddle_event_id, patch) {
      const { error } = await sb
        .from("lovable_paddle_events")
        .update(patch)
        .eq("paddle_event_id", paddle_event_id);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
    async resolvePriceExternalIdByPaddleId(env, paddlePriceId) {
      // Reverse-lookup the price so we can identify founder_lifetime even
      // when the transaction.completed payload omits importMeta.externalId.
      // Env-aware: uses sandbox/live credentials via getPaddleClient(env),
      // so no hardcoded pri_... ids are baked into the code.
      try {
        const paddle = getPaddleClient(env);
        const price = await paddle.prices.get(paddlePriceId);
        // Paddle SDK camelCases → importMeta.externalId
        const externalId =
          (price as { importMeta?: { externalId?: string } | null } | null)?.importMeta
            ?.externalId ?? null;
        return { ok: true, externalId };
      } catch (e) {
        return { ok: false, error: String(e instanceof Error ? e.message : e) };
      }
    },
    async allocateFounderLifetime({
      user_id,
      paddle_transaction_id,
      paddle_customer_id,
      environment,
      now,
    }) {
      // H3 (audit fix): atomic Founder Lifetime allocation. Delegates to
      // allocate_lovable_founder_lifetime, which is service_role-only,
      // advisory-locked, and enforces the 75-slot cap.
      const { data, error } = await sb.rpc("allocate_lovable_founder_lifetime", {
        p_user_id: user_id,
        p_paddle_transaction_id: paddle_transaction_id,
        p_paddle_customer_id: paddle_customer_id,
        p_environment: environment,
        p_now: now.toISOString(),
      });
      if (error) {
        return { ok: false, reason: `rpc_error:${error.message}` };
      }
      const payload = (data ?? {}) as { ok?: boolean; reason?: string };
      if (payload.ok === true) {
        const reason = payload.reason === "idempotent" ? "idempotent" : "allocated";
        return { ok: true, reason };
      }
      return { ok: false, reason: payload.reason ?? "unknown_allocator_result" };
    },
    async cancelOtherRecurringSubscriptions({ user_id, environment, exceptPaddleSubscriptionId }) {
      // Double-bill fix: a Founder Lifetime buyer's old recurring Pro plan
      // must stop billing. Cancel at the NEXT billing period (they keep the
      // period they already paid for; founder entitlement covers everything
      // anyway). Local rows are the candidate list; Paddle's own
      // subscription.canceled webhook closes the loop by flipping
      // cancel_at_period_end on the row, which also removes it from this
      // candidate query on any replay.
      const { data, error } = await sb
        .from("subscriptions")
        .select("paddle_subscription_id")
        .eq("user_id", user_id)
        .eq("environment", environment)
        .in("status", ["active", "trialing", "past_due"])
        .eq("cancel_at_period_end", false)
        .not("paddle_subscription_id", "like", "lifetime_%")
        .neq("paddle_subscription_id", exceptPaddleSubscriptionId);
      if (error) return { ok: false, error: `candidate_query:${error.message}` };
      const rows = (data ?? []) as Array<{ paddle_subscription_id: string }>;
      if (rows.length === 0) return { ok: true, canceled: 0 };
      const paddle = getPaddleClient(environment);
      let canceled = 0;
      const failures: string[] = [];
      for (const row of rows) {
        try {
          await paddle.subscriptions.cancel(row.paddle_subscription_id, {
            effectiveFrom: "next_billing_period",
          });
          canceled += 1;
        } catch (e) {
          failures.push(
            `${row.paddle_subscription_id}:${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
      if (failures.length > 0) return { ok: false, error: failures.join("; ") };
      return { ok: true, canceled };
    },
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const env = (url.searchParams.get("env") || "sandbox") as PaddleEnv;
  if (env !== "sandbox" && env !== "live") {
    return new Response("Invalid env", { status: 400 });
  }

  // Clone before verifyWebhook consumes the body — we persist the raw
  // payload for audit.
  const cloned = req.clone();
  const rawBody = await cloned.text();

  let event: EventLikeWithId;
  try {
    event = (await verifyWebhook(req, env)) as EventLikeWithId;
  } catch (e) {
    console.error("paddle signature verification failed:", String(e));
    return new Response("Invalid signature", { status: 400 });
  }

  let result;
  try {
    result = await handleVerifiedEvent(buildDeps(), event, env, new Date(), safeParseJson(rawBody));
  } catch (e) {
    console.error("handleVerifiedEvent threw:", String(e));
    // Uncaught throw → treat as transient, ask Paddle to retry.
    return new Response(JSON.stringify({ error: "internal" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log("payments-webhook result:", result.reason);
  return new Response(JSON.stringify({ status: result.reason }), {
    status: result.httpStatus,
    headers: { "Content-Type": "application/json" },
  });
});
