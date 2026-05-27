/**
 * aiDoctorConfidenceRules — pure helper that harmonizes the Structured AI
 * Doctor's numeric `diagnosis.confidence` with the legacy/context
 * `confidenceCeiling` produced by `evaluateAiContextSufficiency`.
 *
 * Pure & deterministic. No React. No Supabase. No I/O. No alert writes.
 * No Action Queue side effects. No automation. No device-control.
 *
 * The goal is to keep Coach surfaces from showing a high numeric confidence
 * when the grow context is sparse, mixed, demo, or otherwise capped by the
 * legacy sufficiency rules — growers should not see two confidence signals
 * disagreeing.
 */

import type { AiContextConfidenceCeiling } from "@/lib/aiContextSufficiencyRules";
import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/aiDoctorDiagnosisRules";

/** Numeric caps applied to `diagnosis.confidence` for each ceiling bucket. */
export const CONFIDENCE_CEILING_CAPS: Record<
  AiContextConfidenceCeiling,
  number
> = {
  high: 1,
  medium: 0.6,
  low: 0.3,
};

/** Copy shown when the harmonized confidence is below the raw confidence. */
export const CONFIDENCE_LIMITED_COPY =
  "Confidence limited by missing or sparse grow context.";

export interface HarmonizedConfidence {
  /** Raw model confidence, clamped to [0,1]. Internal use / debugging only. */
  rawConfidence: number;
  /** UI-safe confidence after the ceiling cap. */
  displayedConfidence: number;
  /** True when the cap actually reduced the value. */
  wasCapped: boolean;
  /** Ceiling bucket the cap came from. */
  ceiling: AiContextConfidenceCeiling;
  /** Optional UI note — present only when `wasCapped`. */
  limitedCopy: string | null;
}

function clamp01(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/**
 * Harmonize a numeric diagnosis confidence against a categorical context
 * ceiling. The returned `displayedConfidence` is the value Coach surfaces
 * should render; the raw value is preserved for analytics/debugging only.
 */
export function harmonizeDiagnosisConfidence(
  rawConfidence: unknown,
  ceiling: AiContextConfidenceCeiling | null | undefined,
): HarmonizedConfidence {
  const raw = clamp01(rawConfidence);
  const c: AiContextConfidenceCeiling =
    ceiling === "high" || ceiling === "medium" || ceiling === "low"
      ? ceiling
      : "high";
  const cap = CONFIDENCE_CEILING_CAPS[c];
  const displayed = Math.min(raw, cap);
  const wasCapped = displayed < raw;
  return {
    rawConfidence: raw,
    displayedConfidence: displayed,
    wasCapped,
    ceiling: c,
    limitedCopy: wasCapped ? CONFIDENCE_LIMITED_COPY : null,
  };
}

/**
 * True when the harmonized (displayed) confidence is below the structured
 * diagnosis low-confidence threshold. Callers can use this to ensure the
 * missing-information guidance keeps showing even when the model returned
 * a high raw confidence but the context ceiling capped it down.
 */
export function isDisplayedConfidenceLow(h: HarmonizedConfidence): boolean {
  return h.displayedConfidence < LOW_CONFIDENCE_THRESHOLD;
}
