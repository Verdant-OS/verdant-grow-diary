/**
 * checkout-status — read-only failure detector for the CheckoutSuccess page.
 *
 * Verifies the caller's JWT, then uses service_role to peek at the caller's
 * recent rows in `public.lovable_paddle_events` and report whether the most
 * recent webhook delivery for this user reached a terminal `failed` state
 * that entitlements will never resolve.
 *
 * Purpose:
 *   The CheckoutSuccess page primarily waits on the entitlements resolver
 *   (union of lovable_paddle_subscriptions + lifetime). That poll times out
 *   quietly if the webhook never lands OR if it lands but the processor
 *   returned `failed`. This function distinguishes those cases so the UI can
 *   show "payment received but processing failed, contact support" instead
 *   of a silent stall.
 *
 * Safety:
 *   - Read-only. No writes, no automation, no AI, no device control.
 *   - Never returns payload contents, tokens, or Paddle IDs beyond the
 *     minimum needed (event_type + processing_status + a short error tag).
 *   - Rows are scoped by service_role query but filtered `user_id = <jwt sub>`
 *     — defence in depth against any future accidental broadening.
 *   - `lovable_paddle_events` is RLS-locked to service_role only; we cannot
 *     scope this via a user-JWT client, so service_role is required.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

// Only surface events from the recent checkout window. Longer than the
// client's 30 s poll (allows for slow webhook delivery), short enough that
// an older unrelated failure won't be misattributed to this checkout.
const RECENT_WINDOW_MS = 15 * 60 * 1000;

type ProcessingStatus = "received" | "processed" | "skipped" | "failed";

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST" && req.method !== "GET") {
    return json(405, { ok: false, reason: "method_not_allowed" });
  }

  const auth = req.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return json(401, { ok: false, reason: "not_authenticated" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseAnon || !serviceRoleKey) {
    return json(500, { ok: false, reason: "config_missing" });
  }

  // Verify the caller via their JWT-scoped client. NEVER trust a
  // client-supplied user id.
  const userClient = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return json(401, { ok: false, reason: "not_authenticated" });
  }
  const userId = userData.user.id;

  // Service-role read: lovable_paddle_events has no authenticated grants
  // (RLS locked to service_role). We narrow to this user_id + the recent
  // window ourselves.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const since = new Date(Date.now() - RECENT_WINDOW_MS).toISOString();

  const { data, error } = await admin
    .from("lovable_paddle_events")
    .select(
      "processing_status, event_type, skip_reason, last_error, received_at",
    )
    .eq("user_id", userId)
    .gte("received_at", since)
    .order("received_at", { ascending: false })
    .limit(1);

  if (error) {
    return json(500, { ok: false, reason: "lookup_failed" });
  }

  const row = (data?.[0] ?? null) as
    | {
        processing_status: ProcessingStatus;
        event_type: string;
        skip_reason: string | null;
        last_error: string | null;
        received_at: string;
      }
    | null;

  if (!row) {
    return json(200, {
      ok: true,
      latestStatus: null,
      hasFailed: false,
      hasProcessed: false,
    });
  }

  return json(200, {
    ok: true,
    latestStatus: row.processing_status,
    hasFailed: row.processing_status === "failed",
    hasProcessed: row.processing_status === "processed",
    eventType: row.event_type,
    // Short skip reason label is safe to expose (already a controlled enum
    // in orchestrator.ts). last_error is intentionally NOT returned — it may
    // contain stack traces or internal detail.
    skipReason: row.skip_reason,
    receivedAt: row.received_at,
  });
});
