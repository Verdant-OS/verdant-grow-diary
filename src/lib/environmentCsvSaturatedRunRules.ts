/**
 * Saturated-run warnings for the in-app tent CSV import modal.
 *
 * The /sensors/csv-preview page flags these runs through csvSensorPreviewRules.
 * The import modal works on parsed rows, not raw cells, so this maps those
 * rows to the same detector. Warning only: it does not drop rows and does not
 * change whether the import can be confirmed.
 */
import {
  SaturatedReadingRunRules,
  type SaturatedReadingMetric,
  type SaturatedReadingSample,
} from "@/lib/saturatedReadingRunRules";
import { CSV_PREVIEW_WARNING_COPY } from "@/lib/csvSensorPreviewWarningCopy";

export const ENVIRONMENT_CSV_SATURATED_RUN_TEST_ID = "csv-import-saturated-runs" as const;

export interface EnvironmentCsvSaturatedRunRow {
  rowNumber: number;
  captured_at: string | null;
  humidity_pct: number | null;
  soil_moisture_pct?: number | null;
}

const METRICS: readonly SaturatedReadingMetric[] = ["humidity_pct", "soil_moisture_pct"];

export class EnvironmentCsvSaturatedRunRules {
  private static samples(
    metric: SaturatedReadingMetric,
    rows: readonly EnvironmentCsvSaturatedRunRow[],
  ): SaturatedReadingSample[] {
    return rows.map((row) => ({
      value: row[metric] ?? null,
      at: row.captured_at || null,
      index: row.rowNumber,
    }));
  }

  /** One line per run, humidity first. Empty when no run reaches the minimum length. */
  static warnings(rows: readonly EnvironmentCsvSaturatedRunRow[]): string[] {
    const title = CSV_PREVIEW_WARNING_COPY.saturated_reading_run.title;
    return METRICS.flatMap((metric) =>
      SaturatedReadingRunRules.findRuns(
        metric,
        EnvironmentCsvSaturatedRunRules.samples(metric, rows),
      ).map((run) => `${title} · ${SaturatedReadingRunRules.describe(run)}`),
    );
  }
}
