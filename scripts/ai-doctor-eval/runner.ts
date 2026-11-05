// AI Doctor offline eval (Option C) — runner core (Deno).
//
// Drives the REAL ai-doctor-review handler (supabase/functions/ai-doctor-review)
// with an in-memory Supabase stand-in, so every production step runs as
// shipped: packet validation, stage grading, any server freshness rules,
// prompt assembly, the provider call, the contract gate and the grounding gate.
//
// Safety:
//  - No Supabase or other network call: a fetch guard allows only the Gemini
//    host; every other host throws. Credit and finalize RPCs are fakes.
//  - Nothing is written anywhere except the caller's output directory.
//  - The handler is imported read-only; this file never edits it.
//
// Docs: docs/agents/handoffs/AI-DOCTOR-OFFLINE-EVAL.md

import { handleAiDoctorReviewRequest } from "../../supabase/functions/ai-doctor-review/index.ts";
import {
  AI_DOCTOR_EVAL_CASES,
  materializeAiDoctorEvalPacket,
  type AiDoctorEvalCase,
} from "../../src/test/fixtures/ai-doctor-eval/cases.ts";
import type {
  AiDoctorEvalOutcome,
  AiDoctorEvalRunRecord,
} from "../../src/lib/aiDoctorEvalScoringRules.ts";

export const GEMINI_HOST = "generativelanguage.googleapis.com";
const EVAL_USER_ID = "00000000-0000-4000-8000-0000000e7a11";
const EVAL_GROW_ID = "00000000-0000-4000-8000-00000000960e";
const EVAL_SPEND_ID = "00000000-0000-4000-8000-0000000005e0";

export interface ShownOutput {
  caseId: string;
  group: string;
  run: number;
  description: string;
  result: unknown;
}

export interface EvalRunOutput {
  records: AiDoctorEvalRunRecord[];
  shown: ShownOutput[];
  blockedHosts: string[];
}

type FetchLike = (input: Request | URL | string, init?: RequestInit) => Promise<Response>;

/** Maps the refund reason the handler sends on failure to an eval outcome. */
export function classifyRefundReason(reason: string | null): {
  outcome: AiDoctorEvalOutcome;
  detail: string | null;
} {
  if (reason === null) return { outcome: "unclassified", detail: null };
  if (reason.startsWith("invalid_")) return { outcome: "contract_invalid", detail: reason };
  if (reason.startsWith("grounding_")) return { outcome: "grounding_invalid", detail: reason };
  if (reason === "upstream_empty") return { outcome: "empty", detail: reason };
  if (reason === "upstream_parse") return { outcome: "parse", detail: reason };
  if (reason === "upstream_timeout") return { outcome: "timeout", detail: reason };
  if (
    reason === "upstream_402" ||
    reason === "upstream_429" ||
    reason.startsWith("upstream_http_")
  ) {
    return { outcome: "provider_http_error", detail: reason };
  }
  return { outcome: "unclassified", detail: reason };
}

function readUsage(payload: unknown): { prompt: number | null; completion: number | null } {
  const usage = (
    payload as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } } | null
  )?.usage;
  const p = usage?.prompt_tokens;
  const c = usage?.completion_tokens;
  return {
    prompt: typeof p === "number" && Number.isFinite(p) ? p : null,
    completion: typeof c === "number" && Number.isFinite(c) ? c : null,
  };
}

/** Environment the handler requires. All values are local placeholders except the provider key. */
export function evalHandlerEnv(geminiApiKey: string): Record<string, string> {
  const hmac = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return {
    SUPABASE_URL: "https://offline-eval.invalid",
    SUPABASE_ANON_KEY: "offline-eval-placeholder",
    SUPABASE_SERVICE_ROLE_KEY: "offline-eval-placeholder",
    PAYMENTS_ENVIRONMENT: "sandbox",
    AI_DOCTOR_RECEIPT_HMAC_KEY: hmac,
    AI_DOCTOR_RECEIPT_HMAC_KEY_ID: "offline-eval",
    GEMINI_API_KEY: geminiApiKey,
  };
}

/**
 * Runs every case `runs` times through the real handler. The caller must have
 * set the environment from `evalHandlerEnv`. `providerFetch` performs the
 * Gemini call (real fetch for a live run, a stub in tests).
 */
export async function runAiDoctorEval(opts: {
  providerFetch: FetchLike;
  runs: number;
  cases?: readonly AiDoctorEvalCase[];
  clock?: () => Date;
  onProgress?: (line: string) => void;
}): Promise<EvalRunOutput> {
  const cases = opts.cases ?? AI_DOCTOR_EVAL_CASES;
  const clock = opts.clock ?? (() => new Date());
  const records: AiDoctorEvalRunRecord[] = [];
  const shown: ShownOutput[] = [];
  const blockedHosts: string[] = [];

  let refundReason: string | null = null;
  let latencyMs: number | null = null;
  let usage: { prompt: number | null; completion: number | null } = {
    prompt: null,
    completion: null,
  };

  const originalFetch = globalThis.fetch;
  // snip:prod — network fence: only the provider host may be reached.
  const guardedFetch: FetchLike = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname !== GEMINI_HOST) {
      blockedHosts.push(url.hostname);
      throw new Error(`offline eval: blocked network call to ${url.hostname}`);
    }
    const started = performance.now();
    try {
      const response = await opts.providerFetch(input, init);
      latencyMs = Math.round(performance.now() - started);
      try {
        usage = readUsage(await response.clone().json());
      } catch {
        usage = { prompt: null, completion: null };
      }
      return response;
    } catch (error) {
      latencyMs = Math.round(performance.now() - started);
      throw error;
    }
  };

  const fakeClient = () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: EVAL_USER_ID } }, error: null }) },
    rpc: (name: string, args?: Record<string, unknown>) => {
      if (name === "ai_credit_spend") {
        return Promise.resolve({
          data: {
            ok: true,
            status: "spent",
            spend_id: EVAL_SPEND_ID,
            feature: args?.p_feature,
            model_tier: args?.p_model_tier,
            grow_id: args?.p_grow_id,
          },
          error: null,
        });
      }
      if (name === "ai_credit_refund") {
        refundReason = typeof args?.p_reason === "string" ? args.p_reason : "unknown_refund";
        return Promise.resolve({ data: { ok: true, status: "refunded" }, error: null });
      }
      if (name === "ai_doctor_finalize_review") {
        return Promise.resolve({ data: { ok: true, status: "recorded" }, error: null });
      }
      return Promise.resolve({
        data: null,
        error: { message: `offline eval: no fake for ${name}` },
      });
    },
  });

  globalThis.fetch = guardedFetch as typeof fetch;
  try {
    for (const c of cases) {
      for (let run = 1; run <= opts.runs; run++) {
        refundReason = null;
        latencyMs = null;
        usage = { prompt: null, completion: null };
        const body = {
          packet: materializeAiDoctorEvalPacket(c, clock()),
          growId: EVAL_GROW_ID,
          idempotencyKey: crypto.randomUUID(),
        };
        const req = new Request("https://offline-eval.invalid/functions/v1/ai-doctor-review", {
          method: "POST",
          headers: { Authorization: "Bearer offline-eval", "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const res = await handleAiDoctorReviewRequest(req, { createClient: fakeClient as never });
        const json = (await res.json()) as {
          ok: boolean;
          reason?: string;
          result?: Record<string, unknown>;
        };

        let outcome: AiDoctorEvalOutcome;
        let detail: string | null;
        let confidence: AiDoctorEvalRunRecord["confidence"] = null;
        let missingInformationCount: number | null = null;
        if (json.ok === true && json.result) {
          outcome = "ok";
          detail = null;
          const conf = json.result.confidence;
          confidence = conf === "low" || conf === "medium" || conf === "high" ? conf : null;
          const missing = json.result.missing_information;
          missingInformationCount = Array.isArray(missing) ? missing.length : null;
          shown.push({
            caseId: c.id,
            group: c.group,
            run,
            description: c.description,
            result: json.result,
          });
        } else {
          ({ outcome, detail } = classifyRefundReason(refundReason));
          if (outcome === "unclassified" && detail === null)
            detail = `handler_reason_${json.reason ?? "missing"}`;
        }
        records.push({
          caseId: c.id,
          group: c.group,
          run,
          outcome,
          failureDetail: detail,
          confidence,
          missingInformationCount,
          providerLatencyMs: latencyMs,
          promptTokens: usage.prompt,
          completionTokens: usage.completion,
        });
        opts.onProgress?.(`${c.id} run ${run}: ${outcome}${detail ? ` (${detail})` : ""}`);
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
  return { records, shown, blockedHosts };
}
