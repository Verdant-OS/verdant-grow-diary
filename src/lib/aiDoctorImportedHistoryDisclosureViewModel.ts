/**
 * aiDoctorImportedHistoryDisclosureViewModel — pure presenter helper
 * that turns an AI Doctor compiled context into a safe, read-only
 * disclosure payload for the imported CSV/XLSX history panel.
 *
 * Hard constraints:
 *  - Pure. No I/O, no React, no Supabase, no automation.
 *  - Read-only display. NEVER returns raw_payload, raw_row, device
 *    serials, bridge tokens, source file names, import batch IDs, or
 *    internal IDs.
 *  - Imported history is labeled historical; never live telemetry.
 *  - When the compiled context carries no imported history, returns
 *    `{ visible: false }` and the panel must render nothing.
 */

import type { PlantContextPayload } from "./aiDoctorContextCompiler";

export const IMPORTED_HISTORY_DISCLOSURE_STRINGS = Object.freeze({
  panelTitle: "Imported sensor history used",
  panelBody:
    "AI Doctor used imported CSV/XLSX history as historical context. This is not live telemetry.",
  sourceLabel: "CSV history",
  missingLiveWarning:
    "Current/live sensor readings were missing or unavailable.",
});

export interface ImportedHistoryDisclosureMetric {
  metric: string;
  unit: string | null;
  count: number;
  min: number;
  max: number;
  avg: number;
}

export interface ImportedHistoryDisclosureVisible {
  visible: true;
  title: string;
  body: string;
  sourceLabel: string;
  vendorLabels: readonly string[];
  dateRange: { earliest: string; latest: string } | null;
  totalReadings: number;
  metrics: readonly ImportedHistoryDisclosureMetric[];
  suspiciousFlagCount: number;
  showSuspiciousFlags: boolean;
  showMissingLiveWarning: boolean;
  missingLiveWarning: string | null;
}

export interface ImportedHistoryDisclosureHidden {
  visible: false;
}

export type ImportedHistoryDisclosureViewModel =
  | ImportedHistoryDisclosureVisible
  | ImportedHistoryDisclosureHidden;

export function buildAiDoctorImportedHistoryDisclosureViewModel(
  ctx: Pick<
    PlantContextPayload,
    "imported_sensor_history" | "missingLiveSensorReadings"
  > | null
  | undefined,
): ImportedHistoryDisclosureViewModel {
  const history = ctx?.imported_sensor_history ?? null;
  if (!history || !history.hasCsvHistory) {
    return { visible: false };
  }
  const s = IMPORTED_HISTORY_DISCLOSURE_STRINGS;
  const vendorLabels = (history.vendors ?? []).map((v) => v.vendorLabel);
  const metrics: ImportedHistoryDisclosureMetric[] = (history.metrics ?? []).map(
    (m) => ({
      metric: m.metric,
      unit: m.unit ?? null,
      count: m.count,
      min: m.min,
      max: m.max,
      avg: m.avg,
    }),
  );
  const missingLive = ctx?.missingLiveSensorReadings === true;
  return {
    visible: true,
    title: s.panelTitle,
    body: s.panelBody,
    sourceLabel: s.sourceLabel,
    vendorLabels: Object.freeze(vendorLabels),
    dateRange: history.dateRange
      ? { earliest: history.dateRange.earliest, latest: history.dateRange.latest }
      : null,
    totalReadings: history.totalReadings,
    metrics: Object.freeze(metrics),
    suspiciousFlagCount: history.suspiciousFlagCount,
    showSuspiciousFlags: history.suspiciousFlagCount > 0,
    showMissingLiveWarning: missingLive,
    missingLiveWarning: missingLive ? s.missingLiveWarning : null,
  };
}
