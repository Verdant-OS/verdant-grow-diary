import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { runStripeWebhook } from "../_shared/lib/lib/stripeWebhookOrchestrator.ts";

/**
 * Stripe test-mode webhook. Platform JWT verification is off because Stripe
 * does not send a Supabase session. The raw body is verified before any
 * service-role call. Livemode and Founder Lifetime never reach the RPC.
 * p_livemode is hardcoded false; the SQL function refuses anything else.
 */

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stripeEventCreatedIso(rawBody: string, eventId: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as { id?: unknown; created?: unknown };
  if (record.id !== eventId) return null;
  if (typeof record.created !== "number" || !Number.isFinite(record.created)) return null;
  if (record.created <= 0 || record.created >= 10_000_000_000) return null;
  const created = new Date(record.created * 1000);
  if (!Number.isFinite(created.getTime())) return null;
  return created.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const rawBody = await req.text();
  const result = await runStripeWebhook(
    {
      rawBody,
      signatureHeader: req.headers.get("Stripe-Signature"),
      nowMs: Date.now(),
    },
    {
      getSecret: () => Deno.env.get("STRIPE_WEBHOOK_SECRET"),
      applyEvent: async (payload) => {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (!supabaseUrl || !serviceRoleKey) return { ok: false, reason: "webhook_unavailable" };
        const admin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false },
        });
        const { data, error } = await admin.rpc("apply_stripe_test_mode_event", {
          p_event_id: payload.eventId,
          p_event_type: payload.eventType,
          p_action: payload.action,
          p_user_id: payload.userId,
          p_plan_id: payload.planId,
          p_stripe_customer_id: payload.stripeCustomerId,
          p_stripe_subscription_id: payload.stripeSubscriptionId,
          p_status: payload.status,
          p_period_start: payload.periodStart,
          p_period_end: payload.periodEnd,
          p_cancel_at_period_end: payload.cancelAtPeriodEnd,
          p_checkout_session_id: payload.checkoutSessionId,
          p_environment: "sandbox",
          p_livemode: false,
          p_event_created: stripeEventCreatedIso(rawBody, payload.eventId),
        });
        if (error || !data || (data as { ok?: boolean }).ok !== true) {
          const reason = (data as { reason?: string } | null)?.reason ?? "webhook_unavailable";
          return { ok: false, reason };
        }
        return { ok: true, reason: (data as { reason?: string }).reason ?? "applied" };
      },
    },
  );

  return json(result.status, result.body);
});
