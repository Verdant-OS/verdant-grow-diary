// ai-doctor-review — first live AI review slice. Server-side validated.
// Never returns raw model text. A private completion fact is recorded only
// after a fresh response passes the contract. Fails closed.
//
// Hard constraints:
//  - No direct DB writes. Credit spending/refunds, immutable result attachment,
//    and one protected fresh-review completion RPC are the only persistence.
//    No ai_doctor_sessions / alerts / action_queue / sensor_readings writes.
//    No equipment / device control.
//  - LOVABLE_API_KEY stays server-only. Never echoed to client.
//  - Response is always { ok: true, result, credit? } or
//    { ok: false, reason, credit? }.
//  - Model tier + weight are decided SERVER-SIDE. Client cannot self-discount.
//  - Logs include only safe status/reason codes — never raw model text,
//    full packets, secrets, tokens, or unvalidated AI output.
//
// Deployment order is mandatory:
// 1. Apply 20260719043000_ai_credit_result_cache.sql before deploying this function.
// 2. Deploy this function.
// 3. Publish the UUID-sending client.
// The result-attachment RPC has no compatibility fallback by design. Older
// clients reaching step 2 fail request-shape validation before any spend.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { validateAiDoctorReviewResult } from "./contract.ts";
import { buildAiDoctorPromptMessages } from "../../../src/lib/aiDoctorPromptAssembly.ts";
import { parseAiDoctorReviewRequestEnvelope } from "../../../src/lib/aiDoctorReviewRequestTransportRules.ts";
import { validateAndNormalizeAiDoctorReviewRequestPacket } from "../../../src/lib/aiDoctorReviewRequestPacketValidationRules.ts";
import {
  classifyAiDoctorCreditSpend,
  isConfirmedAiDoctorCreditRefund,
  parseAiDoctorResultAttachment,
} from "../../../src/lib/aiDoctorCreditReplayRules.ts";
import { resolveRequiredServerBillingEnvironment } from "../_shared/unionEntitlementLookup.ts";
import { isMissingAiCreditRpcOverload } from "../_shared/aiCreditRpcCompatibility.ts";
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
const COMPLETION_WRITE_TIMEOUT_MS = 1_500;
const RESULT_PERSISTENCE_TIMEOUT_MS = 3_000;

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
  return (
    typeof s === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  );
}

async function settleResultPersistence<T>(operation: PromiseLike<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("result_persistence_timeout")),
          RESULT_PERSISTENCE_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

/**
 * Records only the fact that a freshly generated, contract-validated review
 * completed. It deliberately runs after the provider/result boundary and
 * never changes the grower's response if measurement storage is unavailable.
 */
async function recordFreshAiDoctorReviewCompletion(userId: string, spendId: string): Promise<void> {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!serviceRoleKey || !supabaseUrl) {
    console.log("ai-doctor-review completion=unavailable");
    return;
  }

  try {
    const serviceSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const { data, error } = await Promise.race([
        serviceSupabase.rpc("record_ai_doctor_review_completion", {
          p_spend_id: spendId,
          p_expected_user_id: userId,
        }),
        new Promise<never>((_resolve, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error("completion_timeout")),
            COMPLETION_WRITE_TIMEOUT_MS,
          );
        }),
      ]);
      if (
        error ||
        !data ||
        typeof data !== "object" ||
        (data as Record<string, unknown>).ok !== true
      ) {
        console.log("ai-doctor-review completion=not_recorded");
        return;
      }
      console.log("ai-doctor-review completion=recorded");
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  } catch {
    console.log("ai-doctor-review completion=not_recorded");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return calmFailure("http");
  }

  // Once a spend RPC begins, any unexpected failure is ambiguous: the database
  // may have committed even if this invocation did not receive the response.
  // Preserve the same logical request key so replay can resolve it safely.
  let creditSpendMayExist = false;
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
    const userId = u.user.id;

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const billingEnvironmentResolution = resolveRequiredServerBillingEnvironment();
    if (!serviceRoleKey || !supabaseUrl || !billingEnvironmentResolution.ok) {
      console.log("ai-doctor-review status=config_missing");
      return calmFailure("config");
    }
    const creditSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const billingEnvironment = billingEnvironmentResolution.environment;

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      console.log("ai-doctor-review status=config_missing");
      return calmFailure("config");
    }

    let requestBody: unknown;
    try {
      requestBody = await req.json();
    } catch {
      return calmFailure("parse");
    }
    const request = parseAiDoctorReviewRequestEnvelope(requestBody);
    if (!request) {
      return calmFailure("shape");
    }
    // Validate the complete model-context schema before the first credit RPC.
    // Reconstruction drops unknown/prototype keys and bounds every promptable
    // string, array, and number; malformed packets fail without a spend.
    const validatedPacket = validateAndNormalizeAiDoctorReviewRequestPacket(request.packet);
    if (!validatedPacket) {
      return calmFailure("shape");
    }

    // Server resolves grow scope from an untrusted transport envelope; the
    // atomic credit RPC re-checks ownership. `request.packet` is deliberately
    // separate; only its validated reconstruction may enter prompt assembly.
    const growId = isUuid(request.growId) ? request.growId.toLowerCase() : null;
    if (!isUuid(request.idempotencyKey)) {
      return calmFailure("shape");
    }
    const idempotencyKey = request.idempotencyKey;

    // ---- ai_credit_spend (atomic check-and-spend) ---------------------------
    creditSpendMayExist = true;
    let spendResponse = await creditSupabase.rpc("ai_credit_spend", {
      p_user_id: userId,
      p_billing_environment: billingEnvironment,
      p_feature: FEATURE,
      p_grow_id: growId,
      p_model_tier: MODEL_TIER,
      p_idempotency_key: idempotencyKey,
      p_result: null,
    });
    // Spend-overload compatibility only: if an older database lacks the
    // service-only spend signature, and only for that exact missing-overload
    // error, use the still-authorized legacy user-scoped spend RPC. The result
    // attachment migration remains a hard deployment prerequisite. Permission,
    // timeout, validation, and other database errors always fail closed.
    if (isMissingAiCreditRpcOverload(spendResponse.error, "ai_credit_spend", "p_user_id")) {
      spendResponse = await supabase.rpc("ai_credit_spend", {
        p_feature: FEATURE,
        p_grow_id: growId,
        p_model_tier: MODEL_TIER,
        p_idempotency_key: idempotencyKey,
        p_result: null,
      });
    }
    const { data: spend, error: spendErr } = spendResponse;
    if (spendErr || !spend || typeof spend !== "object") {
      console.log(`ai-doctor-review status=credit_rpc_error`);
      return calmFailure("credit_rpc");
    }
    const spendObj = spend as Record<string, unknown>;

    type RefundOutcome = "confirmed" | "unconfirmed";

    async function refund(spendId: string | null, reason: string): Promise<RefundOutcome> {
      if (!spendId) return "unconfirmed";
      const refundKey = `refund:${spendId}`;
      try {
        let refundResponse = await settleResultPersistence(
          creditSupabase.rpc("ai_credit_refund", {
            p_expected_user_id: userId,
            p_spend_id: spendId,
            p_idempotency_key: refundKey,
            p_reason: reason,
          }),
        );
        if (
          isMissingAiCreditRpcOverload(
            refundResponse.error,
            "ai_credit_refund",
            "p_expected_user_id",
          )
        ) {
          refundResponse = await settleResultPersistence(
            supabase.rpc("ai_credit_refund", {
              p_spend_id: spendId,
              p_idempotency_key: refundKey,
              p_reason: reason,
            }),
          );
        }
        if (!refundResponse.error && isConfirmedAiDoctorCreditRefund(refundResponse.data)) {
          console.log("ai-doctor-review refund=confirmed");
          return "confirmed";
        }
      } catch {
        // The outcome is intentionally ambiguous; a retry must keep the same
        // request key until the credit ledger resolves it.
      }
      console.log("ai-doctor-review refund=unconfirmed");
      return "unconfirmed";
    }

    async function failureAfterRefund(
      spendId: string | null,
      refundReason: string,
      terminalReason: string,
    ): Promise<Response> {
      const outcome = await refund(spendId, refundReason);
      return calmFailure(outcome === "confirmed" ? terminalReason : "result_pending");
    }

    const spendDecision = classifyAiDoctorCreditSpend(spendObj, Date.now());
    if (spendDecision.kind === "refunded") {
      console.log("ai-doctor-review status=result_recording_failed");
      return calmFailure("result_recording_failed");
    }
    if (spendDecision.kind === "denied") {
      console.log("ai-doctor-review status=credit_denied");
      return calmFailure("credit_denied", { credit: spendObj });
    }
    if (spendDecision.kind === "conflict") {
      console.log("ai-doctor-review status=idempotency_conflict");
      return calmFailure("invalid");
    }
    if (spendDecision.kind === "invalid") {
      console.log("ai-doctor-review status=credit_status_invalid");
      return calmFailure("credit_rpc");
    }

    // Keep this edge's pinned review scope authoritative before accepting a
    // replay or spending result from either rollout-compatible RPC shape.
    if (
      spendObj.feature !== FEATURE ||
      spendObj.model_tier !== MODEL_TIER ||
      spendObj.grow_id !== growId
    ) {
      console.log("ai-doctor-review status=credit_scope_mismatch");
      return calmFailure("credit_rpc");
    }

    if (spendDecision.kind === "pending") {
      console.log("ai-doctor-review status=result_pending");
      return calmFailure("result_pending");
    }
    if (spendDecision.kind === "stale") {
      console.log("ai-doctor-review status=stale_resultless_replay");
      return failureAfterRefund(
        spendDecision.spendId,
        "stale_resultless_replay",
        "result_recording_failed",
      );
    }
    if (spendDecision.kind === "cached") {
      const cached = validateAiDoctorReviewResult(spendDecision.result);
      if (cached.ok) {
        console.log("ai-doctor-review status=ok_replayed");
        return safeOk(cached.result, { replayed: true });
      }
      console.log("ai-doctor-review status=cached_result_invalid");
      return failureAfterRefund(
        spendDecision.spendId,
        "cached_result_invalid",
        "result_recording_failed",
      );
    }

    const spendId = spendDecision.spendId;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    // Build the prompt once so the assembled text can feed both the upstream
    // call AND an in-memory cost measurement. Measurement is local-only;
    // never persisted, logged, or returned to the client.
    const promptMessages = buildAiDoctorPromptMessages(validatedPacket);
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
      return failureAfterRefund(spendId, "upstream_timeout", "timeout");
    } finally {
      clearTimeout(timer);
    }

    if (!upstream.ok) {
      console.log(`ai-doctor-review status=http_${upstream.status}`);
      try {
        await upstream.text();
      } catch {
        /* ignore */
      }
      return failureAfterRefund(spendId, `upstream_http_${upstream.status}`, "http");
    }

    let payload: unknown;
    try {
      payload = await upstream.json();
    } catch {
      console.log("ai-doctor-review status=parse_error");
      return failureAfterRefund(spendId, "upstream_parse", "parse");
    }

    // Provider response boundary: attach provider-reported token usage to the
    // in-memory prompt measurement. Pure, immutable; never persisted, never
    // logged, never returned. Raw `payload` is NOT stored anywhere downstream.
    const measurementWithProviderUsage = attachProviderResponseUsageToAiDoctorPromptMeasurement(
      promptMeasurement,
      payload,
    );
    // Reference the result so future safe consumers (none yet) can extend
    // this boundary without changing the call site. No persistence here.
    void measurementWithProviderUsage;

    const toolArgsStr = readToolArguments(payload);
    if (!toolArgsStr) {
      console.log("ai-doctor-review status=empty");
      return failureAfterRefund(spendId, "upstream_empty", "empty");
    }
    let candidate: unknown;
    try {
      candidate = JSON.parse(toolArgsStr);
    } catch {
      console.log("ai-doctor-review status=parse_error");
      return failureAfterRefund(spendId, "upstream_parse", "parse");
    }

    const v = validateAiDoctorReviewResult(candidate);
    if (v.ok === false) {
      console.log("ai-doctor-review status=invalid");
      return failureAfterRefund(spendId, `invalid_${v.reason}`, "invalid");
    }

    let attachment: ReturnType<typeof parseAiDoctorResultAttachment> = "ambiguous";
    try {
      const attachmentResponse = await settleResultPersistence(
        creditSupabase.rpc("ai_credit_attach_result", {
          p_expected_user_id: userId,
          p_spend_id: spendId,
          p_expected_feature: FEATURE,
          p_result: v.result,
        }),
      );
      if (!attachmentResponse.error) {
        attachment = parseAiDoctorResultAttachment(attachmentResponse.data);
      }
    } catch {
      // Timeout/transport ambiguity must preserve the spend and request key.
      // A same-key retry can then recover a cache write whose response was lost.
    }
    if (attachment === "ambiguous") {
      console.log("ai-doctor-review status=result_attachment_pending");
      return calmFailure("result_pending");
    }
    if (attachment === "rejected") {
      console.log("ai-doctor-review status=result_attachment_rejected");
      return failureAfterRefund(spendId, "result_attachment_failed", "result_recording_failed");
    }

    if (attachment === "recorded") {
      // Fresh cache attachment only: cached spend replays and idempotent
      // attachment replays must not increment completion measurement.
      await recordFreshAiDoctorReviewCompletion(userId, spendId);
    }

    console.log("ai-doctor-review status=ok");
    return safeOk(v.result, {
      remaining: spendObj.remaining,
      scope: spendObj.scope,
      scope_limit: spendObj.scope_limit,
    });
  } catch {
    console.log("ai-doctor-review status=unexpected");
    return calmFailure(creditSpendMayExist ? "result_pending" : "http");
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
