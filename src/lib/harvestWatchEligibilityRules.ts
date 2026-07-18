/**
 * Shared, fail-closed eligibility fence for Harvest Watch surfaces.
 *
 * Harvest Watch is a flowering-stage evidence tracker. It must never appear
 * for seedlings, vegetative plants, post-harvest stages, unknown stages,
 * archived plants, or merged source plants. This module decides only whether
 * a Harvest Watch surface may exist; readiness/window rules remain separate
 * and must continue to treat missing flower-start evidence as unavailable.
 *
 * Pure and deterministic: no React, Supabase, I/O, writes, AI, alerts,
 * Action Queue, automation, or device control.
 */
import { normalizeQuickLogStage } from "@/lib/quickLogStageDefaultRules";

export type HarvestWatchEligibilityReason =
  | "eligible"
  | "stage_unknown"
  | "stage_ineligible"
  | "plant_archived"
  | "plant_merged";

export interface HarvestWatchEligibilityInput {
  stage?: unknown;
  isArchived?: boolean | null;
  /** Forward-compatible soft-archive marker; absent in the deployed schema. */
  archivedAt?: unknown;
  /** Forward-compatible merge marker; absent in the deployed schema. */
  mergedIntoPlantId?: unknown;
}

export interface HarvestWatchEligibility {
  eligible: boolean;
  normalizedStage: string | null;
  reason: HarvestWatchEligibilityReason;
}

function hasMarker(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function evaluateHarvestWatchEligibility(
  input: HarvestWatchEligibilityInput,
): HarvestWatchEligibility {
  const normalizedStage = normalizeQuickLogStage(input.stage);

  if (input.isArchived === true || hasMarker(input.archivedAt)) {
    return {
      eligible: false,
      normalizedStage,
      reason: "plant_archived",
    };
  }

  if (hasMarker(input.mergedIntoPlantId)) {
    return {
      eligible: false,
      normalizedStage,
      reason: "plant_merged",
    };
  }

  if (normalizedStage === null) {
    return {
      eligible: false,
      normalizedStage: null,
      reason: "stage_unknown",
    };
  }

  if (normalizedStage !== "flower") {
    return {
      eligible: false,
      normalizedStage,
      reason: "stage_ineligible",
    };
  }

  return {
    eligible: true,
    normalizedStage,
    reason: "eligible",
  };
}

export function isHarvestWatchEligible(input: HarvestWatchEligibilityInput): boolean {
  return evaluateHarvestWatchEligibility(input).eligible;
}
