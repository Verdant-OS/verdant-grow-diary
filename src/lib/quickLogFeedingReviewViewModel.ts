/**
 * quickLogFeedingReviewViewModel — pure helper that builds a compact,
 * human-readable review model from the current Quick Log feeding form state.
 *
 * Hard rules:
 *   - Pure. No I/O. No React. No Supabase. No randomness.
 *   - Read-only derivation. Never mutates input.
 *   - Omits blank optional fields. Never invents values.
 *   - Returns a clear "needs input" state when required fields are missing
 *     so the UI can show guidance instead of a broken preview.
 */

import type {
  QuickLogFeedingFormState,
  QuickLogFeedingFormProductRow,
} from "./quickLogFeedingFormViewModel";

export const FEEDING_REVIEW_TITLE = "Review feeding log" as const;
export const FEEDING_REVIEW_DEFAULTS_FLAG =
  "Includes prefilled feeding defaults" as const;
export const FEEDING_REVIEW_NEEDS_INPUT =
  "Add a nutrient line and product to preview the save." as const;

export interface FeedingReviewProductLabel {
  name: string;
  amount: string | null;
  unit: string | null;
  display: string;
}

export interface FeedingReviewOptionalMetric {
  label: string;
  value: string;
}

export interface FeedingReviewModel {
  /** True when the form does not yet have enough data for a useful preview. */
  needsInput: boolean;
  /** Human-readable nutrient line label. Null when blank. */
  lineLabel: string | null;
  /** Product rows rendered as readable labels. Empty when none present. */
  productLabels: FeedingReviewProductLabel[];
  /** Optional metrics that have been entered. Empty when none present. */
  optionalMetrics: FeedingReviewOptionalMetric[];
  /** Note text when entered. Null when blank. */
  note: string | null;
  /** Whether defaults were applied to this form session. */
  defaultsApplied: boolean;
}

function trim(v: string): string {
  return v.trim();
}

function buildProductLabel(row: QuickLogFeedingFormProductRow): FeedingReviewProductLabel {
  const name = trim(row.name);
  const amount = trim(row.amount);
  const unit = trim(row.unit);

  const hasAmount = amount !== "";
  const hasUnit = unit !== "" && unit !== "ml_per_l";

  let display = name;
  if (hasAmount && hasUnit) {
    display = `${name} — ${amount} ${unit}`;
  } else if (hasAmount) {
    display = `${name} — ${amount}`;
  }

  return {
    name,
    amount: hasAmount ? amount : null,
    unit: hasUnit ? unit : null,
    display,
  };
}

function collectOptionalMetrics(
  form: QuickLogFeedingFormState,
): FeedingReviewOptionalMetric[] {
  const metrics: FeedingReviewOptionalMetric[] = [];

  const push = (label: string, raw: string) => {
    const t = trim(raw);
    if (t !== "") metrics.push({ label, value: t });
  };

  push("pH", form.ph);
  push("EC in", form.ecIn);
  push("EC out", form.ecOut);
  push("Runoff (ml)", form.runoffMl);
  push("Runoff pH", form.runoffPh);
  push("Runoff EC", form.runoffEc);
  push("Water (°C)", form.waterTempC);

  return metrics;
}

export function buildFeedingReview(
  form: QuickLogFeedingFormState,
  defaultsApplied: boolean,
): FeedingReviewModel {
  const lineId = trim(form.lineId);
  const presentProducts = (form.products ?? []).filter(
    (r) => trim(r?.name ?? "") !== "",
  );

  const needsInput = lineId === "" || presentProducts.length === 0;

  const productLabels = presentProducts.map(buildProductLabel);
  const optionalMetrics = collectOptionalMetrics(form);
  const noteRaw = trim(form.note);

  return {
    needsInput,
    lineLabel: lineId === "" ? null : lineId,
    productLabels,
    optionalMetrics,
    note: noteRaw === "" ? null : noteRaw,
    defaultsApplied,
  };
}
