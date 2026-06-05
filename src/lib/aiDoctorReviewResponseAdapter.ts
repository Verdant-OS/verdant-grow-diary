/**
 * aiDoctorReviewResponseAdapter — pure adapter that turns an unknown
 * server response into either a validated `AiDoctorReviewResult` or a
 * calm rejection reason.
 *
 * Hard constraints:
 *  - Pure: no React, no Supabase, no I/O, no model calls.
 *  - Never returns partial / invalid content. Fail closed.
 *  - Never re-emits raw model text or sensitive keys.
 */
import {
  validateAiDoctorReviewResult,
  type AiDoctorReviewResult,
} from "@/lib/aiDoctorReviewResultContract";
import type { AiCreditDenial } from "@/lib/aiCreditLimitNoticeViewModel";

export type AiDoctorLiveReviewFailureReason =
  | "config"
  | "http"
  | "timeout"
  | "parse"
  | "empty"
  | "invalid"
  | "shape"
  | "credit_denied";

export type AiDoctorLiveReviewAdapterOutcome =
  | { ok: true; result: AiDoctorReviewResult }
  | {
      ok: false;
      reason: AiDoctorLiveReviewFailureReason;
      credit?: AiCreditDenial;
    };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function coerceCreditDenial(v: unknown): AiCreditDenial | undefined {
  if (!isPlainObject(v)) return undefined;
  // Pass through; downstream view model is defensive on optional fields.
  return v as unknown as AiCreditDenial;
}

/**
 * Adapt an unknown payload received from the server-side review endpoint.
 * Accepts either a `{ ok, result, reason }` envelope or a bare result.
 */
export function adaptAiDoctorReviewResponse(
  input: unknown,
): AiDoctorLiveReviewAdapterOutcome {
  if (input == null) return { ok: false, reason: "empty" };
  if (!isPlainObject(input)) return { ok: false, reason: "shape" };

  if (input.ok === false) {
    const reason = typeof input.reason === "string" ? input.reason : "invalid";
    const allowed: AiDoctorLiveReviewFailureReason[] = [
      "config",
      "http",
      "timeout",
      "parse",
      "empty",
      "invalid",
      "shape",
      "credit_denied",
    ];
    const mapped: AiDoctorLiveReviewFailureReason = (allowed as string[]).includes(
      reason,
    )
      ? (reason as AiDoctorLiveReviewFailureReason)
      : "invalid";

    if (mapped === "credit_denied") {
      return {
        ok: false,
        reason: "credit_denied",
        credit: coerceCreditDenial(input.credit),
      };
    }
    return { ok: false, reason: mapped };
  }

  const candidate =
    input.ok === true && isPlainObject(input.result) ? input.result : input;
  const v = validateAiDoctorReviewResult(candidate);
  if (v.ok === false) return { ok: false, reason: "invalid" };
  return { ok: true, result: v.result };
}
