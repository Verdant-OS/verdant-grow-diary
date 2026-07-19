/**
 * aiCreditedResponseAdapter — shared pure adapter for any credited AI
 * edge-function response (Doctor live review, Coach, etc.).
 *
 * Server envelope (HTTP 200 always for business outcomes):
 *   { ok: true,  result, credit? }
 *   { ok: false, reason, credit? }
 *
 * Hard constraints:
 *  - Pure: no React, no Supabase, no I/O, no model calls.
 *  - Never returns partial / invalid content. Fail closed.
 *  - Never re-emits raw model text or sensitive keys.
 *  - Unknown reason → "invalid" (fail-closed).
 *  - Generic over success-payload validation via injected validator.
 */
import type { AiCreditDenial } from "@/lib/aiCreditLimitNoticeViewModel";
import type { AiCreditRemainingInput } from "@/lib/aiCreditRemainingBadgeViewModel";

export type AiCreditedFailureReason =
  | "config"
  | "http"
  | "timeout"
  | "parse"
  | "empty"
  | "invalid"
  | "shape"
  | "credit_denied"
  | "upstream_credit_exhausted"
  | "result_pending"
  | "result_recording_failed";

const ALLOWED_REASONS: readonly AiCreditedFailureReason[] = [
  "config",
  "http",
  "timeout",
  "parse",
  "empty",
  "invalid",
  "shape",
  "credit_denied",
  "upstream_credit_exhausted",
  "result_pending",
  "result_recording_failed",
] as const;

export type AiCreditedOutcome<T> =
  | {
      ok: true;
      result: T;
      /** Pass-through from `{ ok:true, result, credit? }`. */
      credit?: AiCreditRemainingInput;
    }
  | {
      ok: false;
      reason: AiCreditedFailureReason;
      /** Present on credit_denied and (when server included one) upstream_credit_exhausted. */
      credit?: AiCreditDenial;
    };

export type CreditedResultValidator<T> = (
  candidate: unknown,
) => { ok: true; result: T } | { ok: false; reason: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function coerceCreditDenial(v: unknown): AiCreditDenial | undefined {
  if (!isPlainObject(v)) return undefined;
  return v as unknown as AiCreditDenial;
}

function coerceCreditRemaining(v: unknown): AiCreditRemainingInput | undefined {
  if (!isPlainObject(v)) return undefined;
  return v as unknown as AiCreditRemainingInput;
}

/**
 * These are request-scope validation failures, not an exhausted allowance.
 * Showing a Free user an upgrade CTA here would be both misleading and a
 * trust failure. The live-review surface renders its calm generic recovery.
 */
function isCreditScopeFailure(credit: AiCreditDenial | undefined): boolean {
  return credit?.reason === "grow_id_required_for_plan" || credit?.reason === "grow_not_owned";
}

/**
 * Adapt an unknown payload from a credited AI edge function. The success
 * `result` is validated via the injected `validate` function so the
 * adapter stays generic.
 *
 * Accepts either a `{ ok, result, reason, credit }` envelope or a bare
 * result (legacy / pre-envelope responses). On a bare success the
 * `validate` callback decides whether the payload is acceptable.
 */
export function adaptCreditedAiResponse<T = unknown>(
  input: unknown,
  validate?: CreditedResultValidator<T>,
): AiCreditedOutcome<T> {
  const validator: CreditedResultValidator<T> =
    validate ??
    ((c) => (isPlainObject(c) ? { ok: true, result: c as T } : { ok: false, reason: "shape" }));
  if (input == null) return { ok: false, reason: "empty" };
  if (!isPlainObject(input)) return { ok: false, reason: "shape" };

  if (input.ok === false) {
    const rawReason = typeof input.reason === "string" ? input.reason : "invalid";
    const mapped: AiCreditedFailureReason = (ALLOWED_REASONS as readonly string[]).includes(
      rawReason,
    )
      ? (rawReason as AiCreditedFailureReason)
      : "invalid";

    if (mapped === "credit_denied" || mapped === "upstream_credit_exhausted") {
      const credit = coerceCreditDenial(input.credit);
      if (mapped === "credit_denied" && isCreditScopeFailure(credit)) {
        return { ok: false, reason: "invalid" };
      }
      return credit ? { ok: false, reason: mapped, credit } : { ok: false, reason: mapped };
    }
    return { ok: false, reason: mapped };
  }

  const isEnvelope = input.ok === true && isPlainObject(input.result);
  const candidate = isEnvelope ? input.result : input;
  const v = validator(candidate);
  if (v.ok === false) return { ok: false, reason: "invalid" };
  const credit = isEnvelope ? coerceCreditRemaining(input.credit) : undefined;
  return credit ? { ok: true, result: v.result, credit } : { ok: true, result: v.result };
}
