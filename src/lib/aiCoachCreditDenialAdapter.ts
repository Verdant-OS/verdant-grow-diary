/**
 * aiCoachCreditDenialAdapter — pure helper that detects AI Coach credit
 * denials from a `supabase.functions.invoke("ai-coach", ...)` error.
 *
 * ai-coach denial transport (server, unchanged):
 *   HTTP 402
 *   body: { error: "credit_denied",
 *           credit: { ok:false, status:"denied", reason:"limit_reached",
 *                     scope, scope_used, scope_limit, remaining,
 *                     plan_id, period_key? } }
 *
 * Because ai-coach returns a non-2xx status, `supabase.functions.invoke`
 * surfaces this as a `FunctionsHttpError` whose `.context` is a `Response`
 * with the JSON body available via `.json()`. We probe that defensively
 * — never throwing — and return either a normalized denial or null.
 *
 * Hard constraints:
 *  - Pure: no React, no Supabase, no I/O, no Date reads.
 *  - Never throws.
 *  - Returns null for non-credit errors or malformed bodies.
 *  - Structural typing — no `import` from `@supabase/...` required.
 */
import type { AiCreditDenial } from "@/lib/aiCreditLimitNoticeViewModel";

export interface CoachCreditDenialOutcome {
  reason: "credit_denied";
  credit: AiCreditDenial;
}

/** Structural shape of FunctionsHttpError. */
interface MaybeFunctionsHttpError {
  name?: string;
  message?: string;
  context?: unknown;
}

interface MaybeResponseLike {
  status?: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function coerceCreditDenial(v: unknown): AiCreditDenial | null {
  if (!isObject(v)) return null;
  // Must look like a denial payload, not a success credit shape.
  if (v.ok !== false) return null;
  if (v.status !== "denied") return null;
  if (typeof v.scope !== "string") return null;
  return v as unknown as AiCreditDenial;
}

async function readBody(ctx: unknown): Promise<unknown> {
  if (!isObject(ctx)) return null;
  const r = ctx as MaybeResponseLike;
  if (typeof r.json === "function") {
    try {
      return await r.json();
    } catch {
      /* fall through to text */
    }
  }
  if (typeof r.text === "function") {
    try {
      const t = await r.text();
      try {
        return JSON.parse(t);
      } catch {
        return null;
      }
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Inspect an `invoke` error and return a normalized credit denial if the
 * underlying HTTP response is a 402 with the expected JSON shape.
 * Returns null for any other error (caller should fall back to existing
 * generic error handling).
 */
export async function parseAiCoachCreditDenial(
  error: unknown,
): Promise<CoachCreditDenialOutcome | null> {
  if (!error) return null;
  if (!isObject(error)) return null;
  const err = error as MaybeFunctionsHttpError;
  const ctx = err.context;

  // Status check is best-effort — if context isn't Response-like we still
  // probe the body. We will *only* accept the result if the body itself
  // carries `error:"credit_denied"`, so falsely matching a non-credit
  // failure is structurally prevented.
  let body: unknown = null;
  try {
    body = await readBody(ctx);
  } catch {
    return null;
  }
  if (!isObject(body)) return null;
  if (body.error !== "credit_denied") return null;
  const credit = coerceCreditDenial(body.credit);
  if (!credit) return null;

  return { reason: "credit_denied", credit };
}
