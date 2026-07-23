// ai-cultivar-qa — Pro "Ask about this cultivar" grounded Q&A.
//
// Monetization: Pro-tier (paid entitlement) feature. This function does NOT
// spend AI credits — the grow-scoped ai_credit ledger is for grow-specific AI
// (doctor/coach). Access is gated on a server-resolved PAID entitlement.
//
// Safety / doctrine:
//  - Answers strictly from the client-supplied public cultivar CONTEXT (the same
//    profile rendered on the public page). The system prompt forbids inventing
//    flowering times, chemistry, potency, chemotype, effects, medical claims, or
//    guaranteed outcomes, and requires a refusal when the context lacks the info.
//  - No DB writes; no alerts/action_queue; no plant linkage.
//  - Response is always { ok: true, answer } or { ok: false, reason }.
//
// Deploy prerequisites (founder): deploy this function and set LOVABLE_API_KEY.
// The system prompt here MUST stay in sync with src/lib/cultivarQaGrounding.ts.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveRequiredServerBillingEnvironment } from "../_shared/unionEntitlementLookup.ts";
import { loadUnionEntitlement } from "../_shared/unionEntitlementLookup.ts";

const MIN_QUESTION = 3;
const MAX_QUESTION = 500;
const MAX_CONTEXT = 8000;

const SYSTEM_PROMPT = [
  "You are Verdant's cautious cannabis cultivation reference assistant.",
  "Answer ONLY using the CONTEXT block about a single sample/reference cultivar.",
  "If the CONTEXT does not contain the answer, say you don't have that information for this reference — do not guess.",
  "Never invent or state as fact: flowering times, potency or cannabinoid/terpene percentages, chemotype, effects, medical or therapeutic claims, or guaranteed outcomes.",
  "Everything is reported and varies by phenotype, environment, and lab method — frame answers that way.",
  "Remind the grower, when relevant, that their own plant's logs, stage, medium, source-labeled sensors, and observed response remain authoritative.",
  "Cite the bracketed source keys from the CONTEXT when you rely on them. Be concise (a short paragraph).",
].join(" ");

interface Body {
  cultivarSlug?: string;
  question?: string;
  context?: string;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
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
    if (!entitlement.isActive) return json({ ok: false, reason: "upgrade_required" }, 200);

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) return json({ ok: false, reason: "not_configured" }, 500);

    const body = (await req.json().catch(() => null)) as Body | null;
    const question = (body?.question ?? "").trim();
    const context = (body?.context ?? "").trim();
    if (question.length < MIN_QUESTION || question.length > MAX_QUESTION) {
      return json({ ok: false, reason: "invalid_question" }, 200);
    }
    if (context.length === 0 || context.length > MAX_CONTEXT) {
      return json({ ok: false, reason: "invalid_context" }, 200);
    }

    let response: Response;
    try {
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `CONTEXT:\n${context}\n\nQuestion: ${question}` },
          ],
        }),
      });
    } catch {
      return json({ ok: false, reason: "upstream_unavailable" }, 200);
    }

    if (response.status === 402 || response.status === 429) {
      return json({ ok: false, reason: "upstream_credit_exhausted" }, 200);
    }
    if (!response.ok) {
      console.log(`ai-cultivar-qa status=upstream_error http=${response.status}`);
      return json({ ok: false, reason: "upstream_error" }, 200);
    }

    const payload = (await response.json().catch(() => null)) as
      | { choices?: Array<{ message?: { content?: string } }> }
      | null;
    const answer = payload?.choices?.[0]?.message?.content?.trim() ?? "";
    if (!answer) return json({ ok: false, reason: "no_answer" }, 200);

    return json({ ok: true, answer });
  } catch (e) {
    console.log(`ai-cultivar-qa status=error msg=${e instanceof Error ? e.message : "unknown"}`);
    return json({ ok: false, reason: "error" }, 200);
  }
});
