/**
 * aiCreditRemainingBadgeViewModel — pure VM for the post-success
 * "credits left" badge shown after a validated AI Doctor review.
 *
 * Pure: no React, no Supabase, no fetch, no Date reads.
 */

export type AiCreditRemainingScope = "per_grow" | "per_month" | string;

export interface AiCreditRemainingInput {
  remaining?: number | null;
  scope_limit?: number | null;
  scope?: AiCreditRemainingScope | null;
  period_key?: string | null;
}

export interface AiCreditRemainingBadgeViewModel {
  visible: boolean;
  label: string;
  title?: string;
  tone: "neutral" | "watch";
}

const HIDDEN: AiCreditRemainingBadgeViewModel = {
  visible: false,
  label: "",
  tone: "neutral",
};

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function buildAiCreditRemainingBadgeViewModel(
  credit?: AiCreditRemainingInput | null,
): AiCreditRemainingBadgeViewModel {
  if (!credit || typeof credit !== "object") return HIDDEN;

  const scope = credit.scope;
  if (scope !== "per_grow" && scope !== "per_month") return HIDDEN;

  if (!isFiniteNumber(credit.remaining)) return HIDDEN;
  if (!isFiniteNumber(credit.scope_limit) || credit.scope_limit <= 0) {
    return HIDDEN;
  }

  const remaining = Math.max(0, Math.floor(credit.remaining));
  const limit = Math.floor(credit.scope_limit);
  const tone: "neutral" | "watch" = remaining <= 0 ? "watch" : "neutral";

  if (scope === "per_grow") {
    return {
      visible: true,
      tone,
      label: `${remaining} of ${limit} AI Doctor checks left for this grow`,
    };
  }

  return {
    visible: true,
    tone,
    label: `${remaining} of ${limit} AI Doctor checks left this month`,
    title: "Resets on the 1st of the month (UTC).",
  };
}
