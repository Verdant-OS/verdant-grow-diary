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

export type AiDoctorLiveReviewFailureReason =
  | "config"
  | "http"
  | "timeout"
  | "parse"
  | "empty"
  | "invalid"
  | "shape";

export type AiDoctorLiveReviewAdapterOutcome =
  | { ok: true; result: AiDoctorReviewResult }
  | { ok: false; reason: AiDoctorLiveReviewFailureReason };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
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
    ];
    return {
      ok: false,
      reason: (allowed as string[]).includes(reason)
        ? (reason as AiDoctorLiveReviewFailureReason)
        : "invalid",
    };
  }

  const candidate =
    input.ok === true && isPlainObject(input.result) ? input.result : input;
  const v = validateAiDoctorReviewResult(candidate);
  if (v.ok === false) return { ok: false, reason: "invalid" };
  return { ok: true, result: v.result };
}
