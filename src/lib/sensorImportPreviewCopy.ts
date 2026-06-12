/**
 * sensorImportPreviewCopy — pure presenter helpers that translate a
 * SourceAppPreview into display copy + an import-enable decision.
 *
 * Preview-only. Pure. No I/O. No state. No persistence side-effects.
 *
 * Persistence policy for this slice:
 *   - AC Infinity remains importable (existing csvSensorImportRules path).
 *   - Spider Farmer / Vivosun / unknown are detected and previewed only;
 *     `importEnabled` is false so the UI must not enable the save button.
 *     The DB metric allow-list (`temp_f`, `ppfd_umol_m2_s`) has not been
 *     confirmed for those vendors yet.
 */
import {
  SOURCE_APP_LABELS,
  type CanonicalMetric,
  type PreviewWarning,
  type SourceAppId,
  type SourceAppPreview,
} from "@/lib/sensorImportSourceApps";

/** Source apps whose persistence path is wired and safe today. */
export const PREVIEW_PERSISTENCE_ENABLED: ReadonlySet<SourceAppId> = new Set<
  SourceAppId
>(["ac_infinity"]);

export const CANONICAL_SOURCE_COPY =
  "Imported rows will be labeled as CSV history, not live readings." as const;

export const UNKNOWN_SOURCE_COPY =
  "Unknown CSV source. Review mapping before importing." as const;

export const SPIDER_FARMER_SENSOR_ONLY_COPY =
  "This Spider Farmer file appears to contain timestamps and device metadata only. No sensor readings will be imported." as const;

export const VIVOSUN_CO2_EMPTY_COPY =
  "CO₂ column found but contains no numeric readings. CO₂ will not be imported." as const;

export const IMPORT_BLOCKED_NOT_WIRED_COPY =
  "Preview only. Saving rows from this source app is not enabled yet." as const;

export interface PreviewCopy {
  sourceAppId: SourceAppId;
  sourceAppLabel: string;
  confidenceLabel: string;
  acceptedRowCount: number;
  rejectedRowCount: number;
  mappedMetrics: CanonicalMetric[];
  unmappedColumns: string[];
  warnings: PreviewWarning[];
  /** Extra surface-level copy lines specific to this preview. */
  notices: string[];
  canonicalSourceCopy: typeof CANONICAL_SOURCE_COPY;
  importEnabled: boolean;
  importDisabledReason: string | null;
}

const CONFIDENCE_LABEL: Record<SourceAppPreview["confidence"], string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
  none: "No confident match",
};

export function buildSourceAppPreviewCopy(
  preview: SourceAppPreview,
): PreviewCopy {
  const notices: string[] = [];

  if (preview.sourceApp === "unknown_source_app") {
    notices.push(UNKNOWN_SOURCE_COPY);
  }

  if (
    preview.sourceApp === "spider_farmer" &&
    preview.acceptedRowCount === 0 &&
    preview.warnings.some((w) => w.code === "sensor_only_export")
  ) {
    notices.push(SPIDER_FARMER_SENSOR_ONLY_COPY);
  }

  if (
    preview.sourceApp === "vivosun" &&
    preview.warnings.some((w) => w.code === "co2_column_empty")
  ) {
    notices.push(VIVOSUN_CO2_EMPTY_COPY);
  }

  const persistenceWired = PREVIEW_PERSISTENCE_ENABLED.has(preview.sourceApp);
  const importEnabled = persistenceWired && preview.acceptedRowCount > 0;
  const importDisabledReason = persistenceWired
    ? preview.acceptedRowCount === 0
      ? "No rows would be imported from this CSV."
      : null
    : IMPORT_BLOCKED_NOT_WIRED_COPY;

  return {
    sourceAppId: preview.sourceApp,
    sourceAppLabel: SOURCE_APP_LABELS[preview.sourceApp],
    confidenceLabel: CONFIDENCE_LABEL[preview.confidence],
    acceptedRowCount: preview.acceptedRowCount,
    rejectedRowCount: preview.rejectedRowCount,
    mappedMetrics: [...preview.mappedMetrics],
    unmappedColumns: [...preview.unmappedColumns],
    warnings: [...preview.warnings],
    notices,
    canonicalSourceCopy: CANONICAL_SOURCE_COPY,
    importEnabled,
    importDisabledReason,
  };
}
