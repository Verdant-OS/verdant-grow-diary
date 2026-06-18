/**
 * Pheno Hunt Start Page — view model.
 *
 * Pure, deterministic shaping for the start-page UI. Combines the draft
 * with the candidate plant list to produce summary + readiness state.
 *
 * No React, no Supabase, no toast. Presenter components consume this.
 */

import {
  filterCandidatePlants,
  getMissingRequiredFields,
  isDraftReady,
  normaliseCandidateLabel,
  defaultCandidateLabel,
  PHENO_HUNT_PERSISTENCE_BLOCKED,
  PHENO_HUNT_PROJECT_GOAL_LABELS,
  type CandidatePlant,
  type CandidateSelection,
  type PhenoHuntDraft,
  type RequiredField,
} from "./phenoHuntStartPageRules";

export interface PhenoHuntStartPageInput {
  draft: PhenoHuntDraft;
  allPlants: readonly CandidatePlant[];
  selections: readonly CandidateSelection[];
  includeArchived?: boolean;
}

export interface CandidateRow {
  plant: CandidatePlant;
  label: string;
  selected: boolean;
}

export interface PhenoHuntStartPageView {
  draft: PhenoHuntDraft;
  candidates: CandidateRow[];
  selectedCandidates: CandidateRow[];
  missingRequired: RequiredField[];
  ready: boolean;
  canSave: boolean;
  saveBlockedReason: string | null;
  summary: PhenoHuntStartPageSummary;
  emptyState: PhenoHuntEmptyState | null;
}

export interface PhenoHuntStartPageSummary {
  huntName: string;
  cultivar: string;
  goalLabel: string | null;
  startDate: string;
  growId: string | null;
  tentId: string | null;
  candidateCount: number;
  candidateLabels: string[];
}

export type PhenoHuntEmptyState =
  | { kind: "no-grow" }
  | { kind: "no-tent" }
  | { kind: "no-plants-in-tent" };

export function buildPhenoHuntStartPageView(
  input: PhenoHuntStartPageInput,
): PhenoHuntStartPageView {
  const { draft, allPlants, selections, includeArchived = false } = input;

  const filtered = filterCandidatePlants(allPlants, {
    growId: draft.growId,
    tentId: draft.tentId,
    includeArchived,
  });

  const selectionMap = new Map(selections.map((s) => [s.plantId, s.label]));

  const candidates: CandidateRow[] = filtered.map((plant, index) => {
    const fallback = defaultCandidateLabel(draft.cultivar, index);
    const raw = selectionMap.get(plant.id);
    const label = raw !== undefined ? normaliseCandidateLabel(raw, fallback) : fallback;
    return { plant, label, selected: selectionMap.has(plant.id) };
  });

  const selectedCandidates = candidates.filter((c) => c.selected);
  const missingRequired = getMissingRequiredFields(draft);
  const ready = isDraftReady(draft);

  const summary: PhenoHuntStartPageSummary = {
    huntName: draft.huntName.trim(),
    cultivar: draft.cultivar.trim(),
    goalLabel: draft.projectGoal ? PHENO_HUNT_PROJECT_GOAL_LABELS[draft.projectGoal] : null,
    startDate: draft.startDate,
    growId: draft.growId,
    tentId: draft.tentId,
    candidateCount: selectedCandidates.length,
    candidateLabels: selectedCandidates.map((c) => c.label),
  };

  const emptyState = computeEmptyState(draft, candidates.length);

  return {
    draft,
    candidates,
    selectedCandidates,
    missingRequired,
    ready,
    canSave: ready && selectedCandidates.length > 0 && !PHENO_HUNT_PERSISTENCE_BLOCKED,
    saveBlockedReason: null,
    summary,
    emptyState,
  };
}

function computeEmptyState(
  draft: PhenoHuntDraft,
  visibleCount: number,
): PhenoHuntEmptyState | null {
  if (!draft.growId) return { kind: "no-grow" };
  if (!draft.tentId) return { kind: "no-tent" };
  if (visibleCount === 0) return { kind: "no-plants-in-tent" };
  return null;
}
