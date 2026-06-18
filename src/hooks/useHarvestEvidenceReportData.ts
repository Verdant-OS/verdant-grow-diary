/**
 * useHarvestEvidenceReportData — read-only, plant-scoped data hook for
 * the Harvest Evidence Report.
 *
 * Reuses the existing diary read-path (`usePlantRecentActivity`) and the
 * normalized PlantRecentActivityRow shape (via `buildPlantRecentActivity`),
 * which is already an acceptable `HarvestEvidenceClassifiableRow`. The
 * hook only loads diary entries — it does NOT read sensor_readings, does
 * NOT call AI, does NOT write, does NOT touch alerts or the Action Queue,
 * and does NOT touch device control.
 *
 * Returned shape feeds `buildHarvestEvidenceReport` directly.
 */
import { useMemo } from "react";

import { useGrowPlant } from "@/hooks/useGrowData";
import { usePlantRecentActivity } from "@/hooks/usePlantRecentActivity";
import { buildPlantRecentActivity } from "@/lib/plantRecentActivityRules";
import type { HarvestEvidenceReportPlantInput } from "@/lib/harvestEvidenceReportViewModel";

/** Maximum diary rows to consider for the report. Read-only. */
export const HARVEST_EVIDENCE_REPORT_PLANT_ROW_LIMIT = 100;

export interface UseHarvestEvidenceReportDataResult {
  /** Plant inputs ready for `buildHarvestEvidenceReport`. Empty when no plant. */
  plantInputs: HarvestEvidenceReportPlantInput[];
  isLoading: boolean;
  isError: boolean;
  /** True when not loading and no harvest-relevant rows could be assembled. */
  isEmpty: boolean;
}

export function useHarvestEvidenceReportData(
  plantId: string | null | undefined,
): UseHarvestEvidenceReportDataResult {
  const {
    data: plant,
    isLoading: plantLoading,
    isError: plantError,
  } = useGrowPlant(plantId ?? undefined);

  const {
    data: rawRows,
    isLoading: rowsLoading,
    isError: rowsError,
  } = usePlantRecentActivity(plantId ?? null);

  const plantInputs = useMemo<HarvestEvidenceReportPlantInput[]>(() => {
    if (!plantId || !plant) return [];
    const rows = buildPlantRecentActivity(rawRows ?? [], {
      plantId: plant.id,
      limit: HARVEST_EVIDENCE_REPORT_PLANT_ROW_LIMIT,
    });
    return [
      {
        plantId: plant.id,
        plantName:
          (plant as { name?: string | null }).name ?? null,
        strain:
          (plant as { strain?: string | null }).strain ?? null,
        stage:
          (plant as { stage?: string | null }).stage ?? null,
        // No explicit inspection windows yet — viewModel falls back to
        // weekly ISO buckets. Future slices can pass real windows.
        inspectionWindows: null,
        rows,
      },
    ];
  }, [plantId, plant, rawRows]);

  const isLoading = !!plantId && (plantLoading || rowsLoading);
  const isError = !!plantId && (plantError || rowsError);
  const isEmpty =
    !isLoading &&
    !isError &&
    (plantInputs.length === 0 ||
      (plantInputs[0]?.rows?.length ?? 0) === 0);

  return { plantInputs, isLoading, isError, isEmpty };
}
