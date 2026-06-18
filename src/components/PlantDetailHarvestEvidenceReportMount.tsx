/**
 * PlantDetailHarvestEvidenceReportMount — plant-scoped mount for the
 * Harvest Evidence Report panel.
 *
 * Read-only. Loads diary rows via `useHarvestEvidenceReportData`, builds
 * the report view-model, and renders the existing presenter. No writes,
 * no AI, no alerts, no Action Queue, no device control, no sensor reads.
 */
import { useMemo } from "react";

import HarvestEvidenceReportPanel from "@/components/HarvestEvidenceReportPanel";
import HarvestEvidenceReportExportButton from "@/components/HarvestEvidenceReportExportButton";
import { useHarvestEvidenceReportData } from "@/hooks/useHarvestEvidenceReportData";
import { buildHarvestEvidenceReport } from "@/lib/harvestEvidenceReportViewModel";

interface Props {
  plantId: string | null | undefined;
  className?: string;
}

export default function PlantDetailHarvestEvidenceReportMount({
  plantId,
}: Props) {
  const { plantInputs, isLoading, isError } =
    useHarvestEvidenceReportData(plantId);

  const report = useMemo(
    () => buildHarvestEvidenceReport(plantInputs),
    [plantInputs],
  );

  if (!plantId) return null;

  if (isLoading) {
    return (
      <section
        className="glass rounded-2xl p-4"
        aria-label="Harvest evidence report loading"
        data-testid="plant-detail-harvest-evidence-report-loading"
      >
        <p className="text-xs text-muted-foreground">
          Loading harvest evidence report…
        </p>
      </section>
    );
  }

  if (isError) {
    return (
      <section
        className="glass rounded-2xl p-4"
        aria-label="Harvest evidence report error"
        data-testid="plant-detail-harvest-evidence-report-error"
      >
        <p className="text-xs text-muted-foreground">
          Harvest evidence report is temporarily unavailable.
        </p>
      </section>
    );
  }

  return (
    <div
      data-testid="plant-detail-harvest-evidence-report-mount"
      className="flex flex-col gap-2"
    >
      <div className="flex justify-end print-hidden">
        <HarvestEvidenceReportExportButton
          report={report}
          isLoading={isLoading}
        />
      </div>
      <HarvestEvidenceReportPanel report={report} />
    </div>
  );
}
