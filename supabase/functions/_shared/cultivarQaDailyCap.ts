// cultivarQaDailyCap — per-user daily cap for ai-cultivar-qa.
//
// Cultivar Q&A is a paid feature outside the grow credit ledger, so nothing
// else stops one account from calling the AI gateway in a loop and draining
// the shared balance that AI Doctor and Coach also use. Security review
// finding E1 (2026-11-19).
//
// The count lives in public.ai_cultivar_qa_daily_usage and is taken by the
// service-role-only RPC public.ai_cultivar_qa_consume before the model call.
// This module only reads that RPC's answer. It fails closed: an error, a
// missing function or a malformed answer means no model call.
//
// Pure, deterministic, no I/O.

export const CULTIVAR_QA_DAILY_LIMIT = 30;

export type CultivarQaDailyCapDecision =
  | { ok: true; used: number; limit: number }
  | { ok: false; reason: "daily_limit_reached" | "usage_unavailable"; status: 200 | 503 };

const UNAVAILABLE: CultivarQaDailyCapDecision = {
  ok: false,
  reason: "usage_unavailable",
  status: 503,
};

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Map the RPC result to a decision. `data` is the jsonb the RPC returns:
 * `{ allowed: boolean, used: integer, limit: integer }`.
 */
export function decideCultivarQaDailyCap(result: {
  data: unknown;
  error: unknown;
}): CultivarQaDailyCapDecision {
  if (result.error) return UNAVAILABLE;
  const data = result.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return UNAVAILABLE;
  const { allowed, used, limit } = data as Record<string, unknown>;
  if (typeof allowed !== "boolean" || !isCount(used) || !isCount(limit)) return UNAVAILABLE;
  if (!allowed) return { ok: false, reason: "daily_limit_reached", status: 200 };
  if (used > limit) return UNAVAILABLE;
  return { ok: true, used, limit };
}
