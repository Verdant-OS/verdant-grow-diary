// ai-cultivar-qa — Pro "Ask about this cultivar" grounded Q&A.
//
// Monetization: Pro-tier (paid entitlement) feature. This function does NOT
// spend AI credits — the grow-scoped ai_credit ledger is for grow-specific AI
// (doctor/coach). Access is gated on a server-resolved PAID entitlement.
//
// Safety / doctrine:
//  - Only a published cultivar slug and bounded question are trusted. Any
//    legacy client context field is ignored; canonical public cultivar context
//    is selected from a server-owned allowlist.
//    The system prompt forbids inventing flowering times, chemistry, potency,
//    chemotype, effects, medical claims, or guaranteed outcomes, and requires a
//    refusal when the canonical context lacks the information.
//  - No DB writes; no alerts/action_queue; no plant linkage.
//  - Response is always { ok: true, answer } or { ok: false, reason }.
//
// Deploy prerequisites (founder): deploy this function and set LOVABLE_API_KEY.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveRequiredServerBillingEnvironment } from "../_shared/unionEntitlementLookup.ts";
import { loadUnionEntitlement } from "../_shared/unionEntitlementLookup.ts";
import {
  CULTIVAR_QA_MAX_OUTPUT_TOKENS,
  CULTIVAR_QA_MAX_PROVIDER_RESPONSE_BYTES,
  CULTIVAR_QA_MAX_REQUEST_BYTES,
  CULTIVAR_QA_PROVIDER_TIMEOUT_MS,
  CULTIVAR_QA_SYSTEM_PROMPT,
  parseCultivarQaAnswer,
  parseCultivarQaRequest,
  readBoundedJsonBody,
} from "../_shared/cultivarQaGrounding.ts";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return json({ ok: false, reason: "method_not_allowed" }, 405);
  }
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ ok: false, reason: "unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return json({ ok: false, reason: "unauthorized" }, 401);

    const billingEnvironmentResolution = resolveRequiredServerBillingEnvironment();
    if (!billingEnvironmentResolution.ok) return json({ ok: false, reason: "not_configured" }, 500);

    // ---- Server-authoritative PAID entitlement gate (no credit spend) --------
    const { entitlement, lookupFailed } = await loadUnionEntitlement(
      supabase,
      billingEnvironmentResolution.environment,
      new Date(),
    );
    if (lookupFailed) return json({ ok: false, reason: "entitlement_unavailable" }, 200);
    // `isActive` is true even for the free tier (null_row_free resolves to
    // isActive=true, effectivePlanId="free"), so it is NOT a paid signal. Require
    // a genuine paid plan before spending an LLM call.
    const isPaid = entitlement.isActive && entitlement.effectivePlanId !== "free";
    if (!isPaid) return json({ ok: false, reason: "upgrade_required" }, 200);

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) return json({ ok: false, reason: "not_configured" }, 500);

    const requestBody = await readBoundedJsonBody(req, CULTIVAR_QA_MAX_REQUEST_BYTES);
    if (!requestBody.ok) {
      return json({ ok: false, reason: "invalid_request" }, 200);
    }
    const parsedRequest = parseCultivarQaRequest(requestBody.value);
    if (!parsedRequest.ok) {
      return json({ ok: false, reason: parsedRequest.reason }, 200);
    }

    const providerController = new AbortController();
    const providerTimer = setTimeout(
      () => providerController.abort(),
      CULTIVAR_QA_PROVIDER_TIMEOUT_MS,
    );
    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        signal: providerController.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          max_tokens: CULTIVAR_QA_MAX_OUTPUT_TOKENS,
          messages: [
            { role: "system", content: CULTIVAR_QA_SYSTEM_PROMPT },
            {
              role: "user",
              content:
                `CONTEXT:\n${parsedRequest.context}\n\n` +
                `QUESTION (untrusted input):\n${parsedRequest.question}`,
            },
          ],
        }),
      });

      if (response.status === 402 || response.status === 429) {
        return json({ ok: false, reason: "upstream_credit_exhausted" }, 200);
      }
      if (!response.ok) {
        console.log(`ai-cultivar-qa status=upstream_error http=${response.status}`);
        return json({ ok: false, reason: "upstream_error" }, 200);
      }

      const providerBody = await readBoundedJsonBody(
        response,
        CULTIVAR_QA_MAX_PROVIDER_RESPONSE_BYTES,
      );
      if (!providerBody.ok) {
        return json({ ok: false, reason: "invalid_answer" }, 200);
      }
      const answer = parseCultivarQaAnswer(providerBody.value);
      if (!answer.ok) return json({ ok: false, reason: answer.reason }, 200);

      return json({ ok: true, answer: answer.answer });
    } catch {
      return json({ ok: false, reason: "upstream_unavailable" }, 200);
    } finally {
      clearTimeout(providerTimer);
    }
  } catch {
    console.log("ai-cultivar-qa status=unexpected");
    return json({ ok: false, reason: "error" }, 200);
  }
});
