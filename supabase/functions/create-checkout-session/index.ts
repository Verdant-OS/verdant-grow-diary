import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { creditPackPurchaseEligible } from "../_shared/lib/lib/creditPackEligibility.ts";
import { runCreateCheckoutSession } from "../_shared/lib/lib/stripeCheckoutSessionOrchestrator.ts";
import { loadUnionEntitlementForUser } from "../_shared/unionEntitlementLookup.ts";

/**
 * Stripe test-mode Checkout Session. Signed-in callers only.
 * Founder Lifetime returns 410 before any Stripe request. The secret must be
 * a test-mode key; that check lives in the shared rules and never logs the key.
 * Service role is used only after auth.getUser succeeds, and only to reuse a
 * sandbox customer id.
 */

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { error: "auth_required" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey)
    return json(503, { error: "checkout_unavailable" });

  const authed = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  let body: { priceId?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const planId = typeof body.priceId === "string" ? body.priceId : "";

  const result = await runCreateCheckoutSession(
    { planId, now: new Date() },
    {
      getEnv: (name) => Deno.env.get(name),
      getUser: async () => {
        const { data, error } = await authed.auth.getUser();
        if (error || !data.user) return null;
        return { id: data.user.id };
      },
      loadPackEligibility: async (userId) => {
        const resolved = await loadUnionEntitlementForUser(authed, userId, "sandbox", new Date());
        if (resolved.lookupFailed) return { lookupFailed: true, eligible: false };
        return { lookupFailed: false, eligible: creditPackPurchaseEligible(resolved.entitlement) };
      },
      lookupStripeCustomerId: async (userId) => {
        const admin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false },
        });
        const { data, error } = await admin
          .from("stripe_test_customers")
          .select("stripe_customer_id")
          .eq("user_id", userId)
          .eq("environment", "sandbox")
          .maybeSingle();
        if (error) throw new Error("customer_lookup_failed");
        const customerId = (data as { stripe_customer_id?: string } | null)?.stripe_customer_id;
        return typeof customerId === "string" ? customerId : null;
      },
      stripeFetch: async (url, init) => {
        const response = await fetch(url, init);
        return { ok: response.ok, status: response.status, json: () => response.json() };
      },
    },
  );

  return json(result.status, result.body);
});
