/**
 * phenoEvidenceQuickLogPrefill — pure builder for opening the EXISTING Quick
 * Log flow from a Pheno workspace "Record <goal> evidence" action.
 *
 * The goal is prefilled ONLY because the grower clicked that exact goal's
 * button — nothing here chooses a goal automatically. The payload rides the
 * existing `verdant:open-quicklog` event into the existing global QuickLog;
 * no new modal, route, or save path. QuickLog itself re-validates the goal
 * against the hunt's live configured goals before the receipt is built, and
 * resets the selection whenever the dialog, plant, or hunt changes.
 *
 * Unlike buildPlantQuickLogPrefill, a tent is NOT required: hunt candidates
 * may be untented; snapshot suggestion is only enabled when a tent exists.
 *
 * Pure. No I/O, no React, no time, no randomness.
 */
import type { PhenoEvidenceGoalId } from "@/lib/phenoEvidenceGoals";
import { sanitizeConfiguredPhenoEvidenceGoals } from "@/lib/phenoEvidenceCaptureRules";

export interface PhenoEvidenceGoalQuickLogPrefillInput {
  huntId: string | null | undefined;
  plantId: string | null | undefined;
  plantName?: string | null;
  growId?: string | null;
  tentId?: string | null;
  /** The exact goal the grower clicked. */
  goalId: string | null | undefined;
  /** The hunt's configured goals — the clicked goal must be one of them. */
  configuredGoals: unknown;
}

export interface PhenoEvidenceGoalQuickLogPrefill {
  plantId: string;
  plantName: string | null;
  growId: string | null;
  tentId: string | null;
  eventType: "observation";
  suggestSnapshot: boolean;
  source: "pheno-evidence-goal";
  phenoHuntId: string;
  phenoEvidenceGoal: PhenoEvidenceGoalId;
}

function cleanId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 128 ? trimmed : null;
}

/**
 * Returns null (no prefill, ordinary Quick Log still works) unless the hunt,
 * candidate, and clicked goal are all present AND the goal is currently one
 * of the hunt's configured goals.
 */
export function buildPhenoEvidenceGoalQuickLogPrefill(
  input: PhenoEvidenceGoalQuickLogPrefillInput,
): PhenoEvidenceGoalQuickLogPrefill | null {
  const huntId = cleanId(input.huntId);
  const plantId = cleanId(input.plantId);
  const goalId = cleanId(input.goalId);
  if (!huntId || !plantId || !goalId) return null;

  const configured = sanitizeConfiguredPhenoEvidenceGoals(input.configuredGoals);
  const goal = configured.find((g) => g === goalId);
  if (!goal) return null;

  const tentId = cleanId(input.tentId);
  return {
    plantId,
    plantName: typeof input.plantName === "string" && input.plantName.trim() ? input.plantName : null,
    growId: cleanId(input.growId),
    tentId,
    eventType: "observation",
    suggestSnapshot: tentId !== null,
    source: "pheno-evidence-goal",
    phenoHuntId: huntId,
    phenoEvidenceGoal: goal,
  };
}
