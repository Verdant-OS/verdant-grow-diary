// ai-doctor-review — first live AI review slice. Server-side validated,
// non-persistent. Never returns raw model text. Fails closed.
//
// Hard constraints:
//  - No DB writes beyond the ai_credit_spends ledger via ai_credit_spend /
//    ai_credit_refund RPCs (S2). No ai_doctor_sessions / alerts /
//    action_queue / sensor_readings writes. No equipment / device control.
//  - LOVABLE_API_KEY stays server-only. Never echoed to client.
//  - Response is always { ok: true, result, credit? } or
//    { ok: false, reason, credit? }.
//  - Model tier + weight are decided SERVER-SIDE. Client cannot self-discount.
//  - Logs include only safe status/reason codes — never raw model text,
//    full packets, secrets, tokens, or unvalidated AI output.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { validateAiDoctorReviewResult } from "./contract.ts";
import { buildAiDoctorPromptMessages } from "../../../src/lib/aiDoctorPromptAssembly.ts";
// Measurement-only cost wiring. Pure helpers; no persistence, no I/O.
import {
  attachProviderResponseUsageToAiDoctorPromptMeasurement,
  buildAiDoctorPromptMeasurement,
} from "../../../src/lib/cost/index.ts";

const TIMEOUT_MS = 25_000;
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";
// S2: server-pinned tier/feature. Escalation is deferred.
const FEATURE = "ai_doctor_review";
const MODEL_TIER = "standard";

// Base system prompt is composed inside buildAiDoctorPromptMessages so
// imported CSV/XLSX history guidance and missing-live-readings notes can
// be appended deterministically without duplicating copy in this file.

const TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "submit_ai_doctor_review",
    description: "Return a cautious AI Doctor review for the supplied plant.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string" },
        likely_issue: { type: "string" },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
        evidence: { type: "array", items: { type: "string" } },
        missing_information: { type: "array", items: { type: "string" } },
        possible_causes: { type: "array", items: { type: "string" } },
        immediate_action: { type: "string" },
        what_not_to_do: { type: "string" },
        twenty_four_hour_follow_up: { type: "string" },
        three_day_recovery_plan: { type: "string" },
        risk_level: {
          type: "string",
          enum: ["low", "watch", "elevated", "high"],
        },
      },
      required: [
        "summary",
        "likely_issue",
        "confidence",
        "evidence",
        "missing_information",
        "possible_causes",
        "immediate_action",
        "what_not_to_do",
        "twenty_four_hour_follow_up",
        "three_day_recovery_plan",
        "risk_level",
      ],
      additionalProperties: false,
    },
  },
};

function calmFailure(reason: string, extra?: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ ok: false, reason, ...(extra ?? {}) }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeOk(result: unknown, credit?: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ ok: true, result, ...(credit ? { credit } : {}) }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isUuid(s: unknown): s is string {
  return typeof s === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function readPacketField(packet: unknown, key: string): unknown {
  if (!packet || typeof packet !== "object") return undefined;
  return (packet as Record<string, unknown>)[key];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return calmFailure("http");
  }

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return calmFailure("http");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return calmFailure("http");

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      console.log("ai-doctor-review status=config_missing");
      return calmFailure("config");
    }

    let packet: unknown;
    try {
      packet = await req.json();
    } catch {
      return calmFailure("parse");
    }
    if (!packet || typeof packet !== "object") {
      return calmFailure("shape");
    }

    // S2: server resolves grow scope from client-supplied grow_id (validated as
    // UUID; ownership is re-verified inside ai_credit_spend). Client may
    // supply idempotency_key for safe retries; we generate one otherwise.
    const rawGrowId = readPacketField(packet, "grow_id") ??
      readPacketField(packet, "growId");
    const growId = isUuid(rawGrowId) ? rawGrowId : null;
    const rawKey = readPacketField(packet, "idempotency_key") ??
      readPacketField(packet, "idempotencyKey");
    const idempotencyKey = (typeof rawKey === "string" &&
        rawKey.length >= 8 && rawKey.length <= 200)
      ? rawKey
      : crypto.randomUUID();

    // ---- ai_credit_spend (atomic check-and-spend) ---------------------------
    const { data: spend, error: spendErr } = await supabase.rpc(
      "ai_credit_spend",
      {
        p_feature: FEATURE,
        p_grow_id: growId,
        p_model_tier: MODEL_TIER,
        p_idempotency_key: idempotencyKey,
        p_result: null,
      },
    );
    if (spendErr || !spend || typeof spend !== "object") {
      console.log(`ai-doctor-review status=credit_rpc_error`);
      return calmFailure("credit_rpc");
    }
    const spendObj = spend as Record<string, unknown>;
    if (spendObj.ok !== true) {
      console.log(
        `ai-doctor-review status=credit_denied reason=${String(spendObj.reason ?? "")}`,
      );
      return calmFailure("credit_denied", { credit: spendObj });
    }
    // Replayed prior result → return cached result without calling the model.
    if (spendObj.status === "replayed" && spendObj.result) {
      const cached = validateAiDoctorReviewResult(spendObj.result);
      if (cached.ok) {
        console.log("ai-doctor-review status=ok_replayed");
        return safeOk(cached.result, { replayed: true });
      }
      // Cached result corrupt; fall through to fresh model call. The spend
      // row is already recorded so we do not double-charge.
    }

    const spendId = typeof spendObj.spend_id === "string" ? spendObj.spend_id : null;
    const refundKey = "refund:" + (spendId ?? idempotencyKey);

    async function refund(reason: string): Promise<void> {
      if (!spendId) return;
      try {
        await supabase.rpc("ai_credit_refund", {
          p_spend_id: spendId,
          p_idempotency_key: refundKey,
          p_reason: reason,
        });
      } catch {
        console.log("ai-doctor-review status=refund_failed");
      }
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    // Build the prompt once so the assembled text can feed both the upstream
    // call AND an in-memory cost measurement. Measurement is local-only;
    // never persisted, logged, or returned to the client.
    const promptMessages = buildAiDoctorPromptMessages(packet);
    const promptMeasurement = buildAiDoctorPromptMeasurement({
      promptName: FEATURE,
      recordedAt: new Date().toISOString(),
      userPromptText: promptMessages.user,
    }).measurement;
    let upstream: Response;
    try {
      upstream = await fetch(GATEWAY_URL, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: promptMessages.system },
            { role: "user", content: promptMessages.user },
          ],
          tools: [TOOL_SCHEMA],
          tool_choice: {
            type: "function",
            function: { name: "submit_ai_doctor_review" },
          },
        }),
      });
    } catch {
      console.log("ai-doctor-review status=timeout_or_network");
      await refund("upstream_timeout");
      return calmFailure("timeout");
    } finally {
      clearTimeout(timer);
    }

    if (!upstream.ok) {
      console.log(`ai-doctor-review status=http_${upstream.status}`);
      try { await upstream.text(); } catch { /* ignore */ }
      await refund(`upstream_http_${upstream.status}`);
      return calmFailure("http");
    }

    let payload: unknown;
    try {
      payload = await upstream.json();
    } catch {
      console.log("ai-doctor-review status=parse_error");
      await refund("upstream_parse");
      return calmFailure("parse");
    }

    const toolArgsStr = readToolArguments(payload);
    if (!toolArgsStr) {
      console.log("ai-doctor-review status=empty");
      await refund("upstream_empty");
      return calmFailure("empty");
    }
    let candidate: unknown;
    try {
      candidate = JSON.parse(toolArgsStr);
    } catch {
      console.log("ai-doctor-review status=parse_error");
      await refund("upstream_parse");
      return calmFailure("parse");
    }

    const v = validateAiDoctorReviewResult(candidate);
    if (v.ok === false) {
      console.log(`ai-doctor-review status=invalid reason=${v.reason}`);
      await refund(`invalid_${v.reason}`);
      return calmFailure("invalid");
    }

    console.log("ai-doctor-review status=ok");
    return safeOk(v.result, {
      remaining: spendObj.remaining,
      scope: spendObj.scope,
      scope_limit: spendObj.scope_limit,
    });
  } catch {
    console.log("ai-doctor-review status=unexpected");
    return calmFailure("http");
  }
});

function readToolArguments(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const choices = (payload as { choices?: unknown[] }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0] as { message?: { tool_calls?: unknown[] } };
  const calls = first?.message?.tool_calls;
  if (!Array.isArray(calls) || calls.length === 0) return null;
  const c = calls[0] as { function?: { arguments?: unknown } };
  const args = c?.function?.arguments;
  return typeof args === "string" && args.trim().length > 0 ? args : null;
}
