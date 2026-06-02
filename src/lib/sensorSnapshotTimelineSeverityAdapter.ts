/**
 * Sensor Snapshot Timeline Severity Adapter
 *
 * Pure adapter consumed by timeline / manual snapshot surfaces. Maps a
 * shared-contract `Classification` into a deterministic severity bundle
 * the UI can render without re-classifying anything in JSX.
 *
 * Hard rule: unsafe/unknown sensor state must NEVER flatten into a
 * generic "available" or "healthy" surface.
 */

import {
  mapSensorSnapshotStatusToSeverity,
  type Classification,
  type SnapshotStatus,
  type SensorSnapshotSeverity,
} from "@/lib/sensorSnapshotStatusContract";

export type TimelineSensorTone =
  | "ok"
  | "caution"
  | "danger"
  | "review"
  | "empty";

export interface TimelineSensorSeverity {
  status: SnapshotStatus;
  severity: SensorSnapshotSeverity;
  tone: TimelineSensorTone;
  /** True only when status === "usable". */
  isHealthy: boolean;
  /** True when status === "stale". */
  isCautionary: boolean;
  /** True for invalid or needs_review. */
  isUnsafe: boolean;
  /** True for no_data. */
  isMissing: boolean;
  /** Presenter-safe label preserved from the contract. */
  label: string;
}

const TONE: Record<SnapshotStatus, TimelineSensorTone> = {
  usable: "ok",
  stale: "caution",
  invalid: "danger",
  needs_review: "review",
  no_data: "empty",
};

const FALLBACK_LABEL: Record<SnapshotStatus, string> = {
  usable: "Sensor snapshot available.",
  stale: "Sensor snapshot is outside the stale window.",
  invalid: "Sensor snapshot is invalid.",
  needs_review: "Sensor snapshot needs review.",
  no_data: "No sensor snapshot.",
};

/**
 * Map a `Classification` (or null) to a deterministic timeline severity.
 * Returns `no_data` severity when no classification is supplied.
 */
export function adaptSnapshotClassificationToTimelineSeverity(
  classification: Classification | null | undefined,
): TimelineSensorSeverity {
  if (!classification) {
    return {
      status: "no_data",
      severity: "empty",
      tone: "empty",
      isHealthy: false,
      isCautionary: false,
      isUnsafe: false,
      isMissing: true,
      label: FALLBACK_LABEL.no_data,
    };
  }
  const status = classification.status;
  return {
    status,
    severity: mapSensorSnapshotStatusToSeverity(status),
    tone: TONE[status],
    isHealthy: status === "usable",
    isCautionary: status === "stale",
    isUnsafe: status === "invalid" || status === "needs_review",
    isMissing: status === "no_data",
    label: classification.label || FALLBACK_LABEL[status],
  };
}
