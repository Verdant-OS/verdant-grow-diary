/**
 * Capture evidence a tent snapshot read attaches beside a {@link SensorSnapshot}.
 *
 * Kept out of `sensorSnapshot.ts` on purpose: that module is mirrored into
 * `supabase/functions/_shared`, and these fields are read only by the browser
 * VPD projections (#2303). Neither field is ever used as a displayed value.
 */
import type { SensorSnapshot } from "@/lib/sensorSnapshot";

/** A telemetry row dropped for intake quality; see `rejected_quality_rows`. */
export interface SensorSnapshotRejectedQualityRow {
  metric: string;
  value: number | string | null;
  captured_at: string;
  source: string;
  quality: string;
  /** The row's device, part of its capture identity (`sensorCaptureRefRules`). */
  device_id?: string | null;
}

export interface SensorSnapshotCaptureEvidence {
  /**
   * Telemetry rows from the same read that the evidence filter dropped for
   * their intake quality (degraded/stale/invalid). Carried so a fallback
   * projection can still reject a capture they belong to, as the raw-row
   * path does (Codex P1 on #2303 at 0994ea2a). Never used as a value.
   */
  rejected_quality_rows?: readonly SensorSnapshotRejectedQualityRow[];
  /**
   * The `diary_entries.id` a generic diary `sensor_snapshot` blob came from.
   * Capture identity only (`sensorCaptureRefRules`): it never links an alert
   * and never makes a blob eligible for alert persistence, unlike
   * `diary_evidence_ref` (Codex P2 on #2303 at 0994ea2a).
   */
  diary_capture_id?: string;
  /**
   * The `device_id` of the exact row behind each `metric_refs` entry. Capture
   * identity only; kept here because `metric_refs` is mirrored into the edge
   * functions (owner decision on #2442).
   */
  metric_device_ids?: Partial<Record<string, string>>;
}

export type CaptureEvidenceSnapshot = SensorSnapshot & SensorSnapshotCaptureEvidence;
