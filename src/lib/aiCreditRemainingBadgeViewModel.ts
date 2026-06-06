/**
 * aiCreditRemainingBadgeViewModel — pure view model for the post-success
 * AI Doctor credit-remaining badge (S3.1).
 *
 * Consumes the `credit` payload already returned by `ai-doctor-review` on a
 * successful run: `{ remaining, scope, scope_limit, period_key? }`.
 *
 * Hard constraints:
 *  - Pure: no React, no Supabase, no fetch, no Date reads.
 *  - No CTA. No upgrade prompt. No urgency language.
 *  - Missing / malformed input → hidden.
 *  - Unknown scope → hidden (fail closed).
 *  - `remaining` below 0 clamps to 0.
 *  - Never asserts AI results are guaranteed.
 */

export type AiCreditRemainingScope = "per_grow" | "per_month" | string;

/**
 * Shape of the `credit` field that `ai-doctor-review` returns on success.
 * Every field is optional so callers can hand us raw decoded JSON safely.
 */
export interface AiCreditRemainingInput {
  remaining?: number | null;
  scope?: AiCreditRemainingScope | null;
  scope_limit?: number | null;
  period_key?: string | null;
}

export interface AiCreditRemainingBadgeViewModel {
  visible: boolean;
  label: string;
  /** Only set for per_month. */
  helper?: string;
  scope?: "per_grow" | "per_month";
  remaining?: number;
  scopeLimit?: number;
}

const HIDDEN: AiCreditRemainingBadgeViewModel = { visible: false, label: "" };

const PER_MONTH_HELPER = "Resets on the 1st of the month (UTC).";

function isFiniteInt(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function clampNonNegative(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : Math.floor(n);
}

export type AiCreditRemainingSurface = "doctor" | "coach";

export interface AiCreditRemainingBadgeOptions {
  /**
   * Calling surface. Switches the noun in the label only — never changes
   * gating, denial handling, or transport behavior. Default: "doctor"
   * (preserves the original S3.1 copy).
   */
  surface?: AiCreditRemainingSurface;
}

function nounFor(surface: AiCreditRemainingSurface): string {
  return surface === "coach" ? "AI credits" : "AI Doctor checks";
}

export function buildAiCreditRemainingBadgeViewModel(
  input: AiCreditRemainingInput | null | undefined,
  options?: AiCreditRemainingBadgeOptions,
): AiCreditRemainingBadgeViewModel {
  if (!input || typeof input !== "object") return HIDDEN;

  const { remaining, scope, scope_limit: scopeLimit } = input;

  if (!isFiniteInt(remaining)) return HIDDEN;
  if (!isFiniteInt(scopeLimit) || scopeLimit <= 0) return HIDDEN;
  if (scope !== "per_grow" && scope !== "per_month") return HIDDEN;

  const remainingClamped = clampNonNegative(remaining);
  const limitClamped = clampNonNegative(scopeLimit);
  const noun = nounFor(options?.surface ?? "doctor");

  if (scope === "per_grow") {
    return {
      visible: true,
      label: `${remainingClamped} of ${limitClamped} ${noun} left for this grow`,
      scope: "per_grow",
      remaining: remainingClamped,
      scopeLimit: limitClamped,
    };
  }

  return {
    visible: true,
    label: `${remainingClamped} of ${limitClamped} ${noun} left this month`,
    helper: PER_MONTH_HELPER,
    scope: "per_month",
    remaining: remainingClamped,
    scopeLimit: limitClamped,
  };
}
