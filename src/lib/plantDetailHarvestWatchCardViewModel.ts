/**
 * plantDetailHarvestWatchCardViewModel — adapter from existing Plant Detail
 * plant/activity data into the already-approved Harvest Watch row view-model.
 *
 * Pure and deterministic. No React. No Supabase. No I/O. No AI calls. No
 * alerts. No Action Queue writes. No automation or device control.
 *
 * v0 enhancements layered on top of the existing v1.5 row (additive only,
 * existing fields preserved):
 *   • `v0ReadinessState` / `v0ReadinessStateLabel` / `v0ReadinessCaution`
 *   • `evidenceChecklist` (trichome, pistil, bud maturity, window, photos)
 *   • `groupedRecent` (photos / notes / snapshots, newest first, safe empty)
 *   • `nextInspection` (cautious diary prefill for the "Next inspection" CTA)
 */
import {
  buildHarvestWatchRowViewModel,
  type HarvestWatchRowViewModel,
} from "@/lib/harvestWatchViewModel";
import type { HarvestWatchInput } from "@/lib/harvestWatchRules";
import type { PlantRecentActivityRow } from "@/lib/plantRecentActivityRules";
import {
  buildEvidenceChecklist,
  groupHarvestRecentItems,
  HARVEST_WATCH_V0_STATE_CAUTION,
  HARVEST_WATCH_V0_STATE_LABEL,
  mapToV0ReadinessState,
  pickNextInspection,
  type HarvestEvidenceChecklistItem,
  type HarvestRecentGroup,
  type HarvestWatchV0ReadinessState,
  type NextInspectionPrefill,
} from "@/lib/harvestWatchCardEvidenceRules";
import {
  buildHarvestEvidenceHistory,
  type HarvestEvidenceHistory,
} from "@/lib/harvestWatchEvidenceHistoryViewModel";

export interface PlantDetailHarvestWatchPlantLike {
  id: string;
  name: string;
  strain?: string | null;
  stage?: string | null;
  startedAt?: string | null;
  photo?: string | null;
}

export interface PlantDetailHarvestWatchActivityLike {
  hasPhoto?: boolean;
  hasSnapshot?: boolean;
  occurredAt?: string | null;
}

export interface PlantDetailHarvestWatchCardViewModel {
  row: HarvestWatchRowViewModel;
  advisoryLabel: string;
  evidenceLabel: string;
  missingContext: string[];
  nextObservation: string;
  stageLabel: string;
  // v0 additions
  v0ReadinessState: HarvestWatchV0ReadinessState;
  v0ReadinessStateLabel: string;
  v0ReadinessCaution: string;
  evidenceChecklist: HarvestEvidenceChecklistItem[];
  groupedRecent: HarvestRecentGroup[];
  nextInspection: NextInspectionPrefill;
  evidenceHistory: HarvestEvidenceHistory;
}

function countActivityPhotos(rows: readonly PlantDetailHarvestWatchActivityLike[]): number {
  return rows.filter((r) => r.hasPhoto === true).length;
}

function latestPhotoAt(rows: readonly PlantDetailHarvestWatchActivityLike[]): string | null {
  const timestamps = rows
    .filter((r) => r.hasPhoto === true && typeof r.occurredAt === "string")
    .map((r) => r.occurredAt as string)
    .filter((ts) => Number.isFinite(Date.parse(ts)))
    .sort((a, b) => Date.parse(b) - Date.parse(a));
  return timestamps[0] ?? null;
}

function stageLabel(stage: string | null | undefined): string {
  const s = typeof stage === "string" && stage.trim() ? stage.trim() : "unknown";
  return s.replace(/_/g, " ");
}

export function buildPlantDetailHarvestWatchCardViewModel(params: {
  plant: PlantDetailHarvestWatchPlantLike;
  recentActivityRows?: readonly PlantDetailHarvestWatchActivityLike[] | null;
  hasPlantPhoto?: boolean;
  now?: Date;
}): PlantDetailHarvestWatchCardViewModel {
  const { plant } = params;
  const now = params.now ?? new Date();
  const rows = params.recentActivityRows ?? [];
  const photos = (params.hasPlantPhoto || !!plant.photo ? 1 : 0) + countActivityPhotos(rows);
  const lastPhotoAt = latestPhotoAt(rows);

  // Plant Detail does not currently expose a true flower-start/flip date or
  // phenotype harvest history. Do not repurpose plant.startedAt as flower age;
  // that would create false precision. Keep those fields null/zero until the
  // proper data exists.
  const input: HarvestWatchInput = {
    plantId: plant.id,
    plantLabel: plant.name,
    phenotypeLabel: plant.strain ?? null,
    daysInFlower: null,
    expectedHarvestDay: null,
    priorGrowCount: 0,
    photoEvidenceCount: photos,
    usableDrybackWindowCount: 0,
    irrigationPlantSelectionQuality: "skipped",
    drybackConfidence: null,
    daysVsHistoryConfidence: null,
    trichome: null,
    lastPhotoAt,
    now,
  };

  const row = buildHarvestWatchRowViewModel(input);
  const missingContext = [
    "Flower start date or flip date",
    "Phenotype harvest history",
    "Usable dryback windows",
    "Close-up harvest photos / trichome notes",
  ];

  const evidenceLabel = `${row.readiness.score == null ? "Evidence building" : "Evidence ready for review"} · ${photos} photo evidence point${photos === 1 ? "" : "s"}`;

  // v0 evidence checklist / grouping / state. Callers may pass either the
  // lightweight PlantDetailHarvestWatchActivityLike shape or the full
  // PlantRecentActivityRow — we narrow defensively for the v0 features.
  const recentForChecklist = (rows as readonly PlantRecentActivityRow[]).filter(
    (r) => typeof r === "object" && r !== null && "notePreview" in r,
  );
  const evidenceChecklist = buildEvidenceChecklist({
    recentRows: recentForChecklist,
    photoEvidenceCount: photos,
    daysInFlower: input.daysInFlower,
    expectedHarvestDay: input.expectedHarvestDay,
  });
  const groupedRecent = groupHarvestRecentItems(recentForChecklist, {
    perGroupLimit: 5,
  });
  const STRONG_KEYS = new Set([
    "trichome_inspection",
    "pistil_observation",
    "bud_maturity_note",
  ]);
  const strongEvidenceCount = evidenceChecklist.filter(
    (i) => STRONG_KEYS.has(i.key) && i.status === "present",
  ).length;
  const v0ReadinessState = mapToV0ReadinessState({
    row,
    photoEvidenceCount: photos,
    daysInFlower: input.daysInFlower,
    expectedHarvestDay: input.expectedHarvestDay,
    strongEvidenceCount,
  });
  const nextInspection = pickNextInspection(evidenceChecklist);

  return {
    row,
    advisoryLabel: "Advisory only — grower decides",
    evidenceLabel,
    missingContext,
    nextObservation:
      photos > 0
        ? "Keep adding close-up bud photos and harvest notes as the window approaches."
        : "Add close-up bud photos and harvest notes before relying on this watch card.",
    stageLabel: stageLabel(plant.stage),
    v0ReadinessState,
    v0ReadinessStateLabel: HARVEST_WATCH_V0_STATE_LABEL[v0ReadinessState],
    v0ReadinessCaution: HARVEST_WATCH_V0_STATE_CAUTION[v0ReadinessState],
    evidenceChecklist,
    groupedRecent,
    nextInspection,
  };
}
