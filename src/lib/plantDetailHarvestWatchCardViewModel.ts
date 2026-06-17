/**
 * plantDetailHarvestWatchCardViewModel — adapter from existing Plant Detail
 * plant/activity data into the already-approved Harvest Watch row view-model.
 *
 * Pure and deterministic. No React. No Supabase. No I/O. No AI calls. No
 * alerts. No Action Queue writes. No automation or device control.
 */
import {
  buildHarvestWatchRowViewModel,
  type HarvestWatchRowViewModel,
} from "@/lib/harvestWatchViewModel";
import type { HarvestWatchInput } from "@/lib/harvestWatchRules";

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
  };
}
