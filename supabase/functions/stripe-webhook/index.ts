import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveRequiredServerBillingEnvironment } from "../_shared/unionEntitlementLookup.ts";
import { processStripeWebhook } from "../_shared/stripeWebhookProcessor.ts";
import { stripeRequest } from "../_shared/stripeApi.ts";

/**
 * Stripe subscription webhook (Slice C of docs/specs/stripe-live-checkout-plan.md).
 * The only writer of Stripe rows in public.subscriptions.
 *
 * Gateway JWT verification is off in supabase/config.toml because Stripe
 * sends no Supabase JWT. Nothing is read or written until the raw-body
 * Stripe-Signature verifies against STRIPE_WEBHOOK_SECRET. The service role
 * stays inside this function; no client write path exists. All decisions
 * live in _shared/stripeWebhookProcessor.ts; this file wires real I/O only.
 */

let serviceClient: ReturnType<typeof createClient> | null = null;
function db(): ReturnType<typeof createClient> {
  if (serviceClient === null) {
    serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
  }
  return serviceClient;
}

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return reply(400, { error: "bad_request" });
  }

  const result = await processStripeWebhook(
    { rawBody, signatureHeader: req.headers.get("Stripe-Signature") },
    {
      getEnv: (name) => Deno.env.get(name),
      resolveEnvironment: () => {
        const resolution = resolveRequiredServerBillingEnvironment();
        return resolution.ok ? { ok: true, environment: resolution.environment } : { ok: false };
      },
      nowSeconds: () => Math.floor(Date.now() / 1000),
      fetchSubscription: async (secretKey, subscriptionId) => {
        const result = await stripeRequest({
          secretKey,
          method: "GET",
          path: `/subscriptions/${encodeURIComponent(subscriptionId)}`,
        });
        return result.ok ? { ok: true, body: result.body } : { ok: false };
      },
      findExistingOwner: async (environment, subscriptionId) => {
        const { data, error } = await db()
          .from("subscriptions")
          .select("user_id")
          .eq("environment", environment)
          .eq("stripe_subscription_id", subscriptionId)
          .maybeSingle();
        if (error) return { ok: false };
        const userId = (data as { user_id?: unknown } | null)?.user_id;
        return { ok: true, userId: typeof userId === "string" ? userId : null };
      },
      upsertRow: async (row) => {
        const { error } = await db()
          .from("subscriptions")
          .upsert(row, { onConflict: "environment,stripe_subscription_id" });
        return { ok: !error };
      },
      log: (fields) => console.warn(JSON.stringify(fields)),
    },
  );

  // The body never carries ids, keys or upstream text.
  return reply(
    result.status,
    result.status === 200 ? { received: true } : { error: "not_processed" },
  );
});
