/**
 * Pheno Hunt Persistence v1 — pure validation rules.
 *
 * Validates a draft + candidate selection set before persisting. No React,
 * no Supabase, no toast, no AI, no alerts, no Action Queue. Deterministic.
 */
import {
  PHENO_HUNT_PROJECT_GOALS,
  type PhenoHuntDraft,
  type PhenoHuntProjectGoal,
  type CandidateSelection,
  type CandidatePlant,
} from "./phenoHuntStartPageRules";

export type PhenoHuntPersistenceErrorCode =
  | "hunt_name_required"
  | "cultivar_required"
  | "project_goal_required"
  | "project_goal_invalid"
  | "start_date_required"
  | "grow_id_required"
  | "no_candidates"
  | "candidate_label_blank"
  | "candidate_labels_duplicated"
  | "candidate_plant_unknown"
  | "candidate_plant_wrong_grow"
  | "candidate_plant_wrong_tent";

export interface PhenoHuntPersistenceError {
  code: PhenoHuntPersistenceErrorCode;
  plantId?: string;
  label?: string;
}

export interface PhenoHuntPersistenceValidationInput {
  draft: PhenoHuntDraft;
  selections: readonly CandidateSelection[];
  plants: readonly CandidatePlant[];
}

export interface PhenoHuntPersistenceValidationResult {
  ok: boolean;
  errors: PhenoHuntPersistenceError[];
}

export function validatePhenoHuntForPersistence(
  input: PhenoHuntPersistenceValidationInput,
): PhenoHuntPersistenceValidationResult {
  const errors: PhenoHuntPersistenceError[] = [];
  const { draft, selections, plants } = input;

  if (!draft.huntName?.trim()) errors.push({ code: "hunt_name_required" });
  if (!draft.cultivar?.trim()) errors.push({ code: "cultivar_required" });
  if (!draft.projectGoal) {
    errors.push({ code: "project_goal_required" });
  } else if (!PHENO_HUNT_PROJECT_GOALS.includes(draft.projectGoal as PhenoHuntProjectGoal)) {
    errors.push({ code: "project_goal_invalid" });
  }
  if (!draft.startDate?.trim()) errors.push({ code: "start_date_required" });
  if (!draft.growId) errors.push({ code: "grow_id_required" });

  if (selections.length === 0) {
    errors.push({ code: "no_candidates" });
  } else {
    const labelCounts = new Map<string, number>();
    const plantById = new Map(plants.map((p) => [p.id, p]));
    for (const sel of selections) {
      const label = sel.label?.trim() ?? "";
      if (!label) {
        errors.push({ code: "candidate_label_blank", plantId: sel.plantId });
      } else {
        const key = label.toLowerCase();
        labelCounts.set(key, (labelCounts.get(key) ?? 0) + 1);
      }
      const plant = plantById.get(sel.plantId);
      if (!plant) {
        errors.push({ code: "candidate_plant_unknown", plantId: sel.plantId });
        continue;
      }
      if (draft.growId && plant.growId !== draft.growId) {
        errors.push({ code: "candidate_plant_wrong_grow", plantId: sel.plantId });
      }
      if (draft.tentId && plant.tentId !== draft.tentId) {
        errors.push({ code: "candidate_plant_wrong_tent", plantId: sel.plantId });
      }
    }
    for (const [label, count] of labelCounts) {
      if (count > 1) errors.push({ code: "candidate_labels_duplicated", label });
    }
  }

  return { ok: errors.length === 0, errors };
}

export function isPhenoHuntDraftSavable(
  input: PhenoHuntPersistenceValidationInput,
): boolean {
  return validatePhenoHuntForPersistence(input).ok;
}
