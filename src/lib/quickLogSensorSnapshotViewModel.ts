/**
 * quickLogSensorSnapshotViewModel — additive pure view-model that takes
 * a "latest sensor context" candidate for a tent/plant and produces a
 * safe Quick Log preview + attachment payload built on the v1 sensor
 * freshness resolver.
 *
 * Why additive:
 *   The existing Quick Log save path (quickLogV2SavePayload /
 *   quickLogV2ManualSnapshotAdapter) and preview strip
 *   (QuickLogSensorSnapshotStrip) already attach a sensor snapshot to
 *   `diary_entries.details.sensor_snapshot`. This view-model does NOT
 *   replace them. It provides a unified resolver-driven shape so future
 *   Quick Log surfaces can render the same safe preview and attachment
 *   without duplicating freshness/source rules.
 *
 * Safety contract:
 *   - Pure: no I/O, no Supabase, no React, no globals, no Date.now()
 *     (clock is injected via `ResolveOptions.now`).
 *   - Never returns raw_payload, secrets, tokens, MAC addresses, or
 *     private identifiers. Tent/plant IDs are accepted only as opaque
 *     strings and round-tripped untouched — callers must already treat
 *     them as safe (existing project convention).
 *   - Stale/invalid/demo/missing input never resolves to a healthy
 *     attachment. `isAttachable` and `attachment` distinguish these
 *     cases for callers.
 *   - Save must never be blocked by missing sensor context — the
 *     `attachment` is optional; absence yields a clearly labeled "no
 *     sensor snapshot available" preview.
 */

import {
  resolveSensorSnapshotDisplay,
  type ResolveOptions,
  type SensorSnapshotDisplayModel,
  type SensorSnapshotInput,
  type SensorSnapshotMetricInput,
} from "@/lib/sensorSnapshotFreshnessRules";

export interface QuickLogSensorContextInput {
  /** Opaque tent identifier (already safe per project convention). */
  tentId?: string | null;
  /** Opaque plant identifier (already safe per project convention). */
  plantId?: string | null;
  /** The latest candidate snapshot to anchor to this Quick Log. */
  snapshot?: SensorSnapshotInput | null;
}

export interface QuickLogSensorSnapshotAttachment {
  source: string;
  captured_at: string | null;
  tent_id: string | null;
  plant_id: string | null;
  confidence: number | null;
  freshness: SensorSnapshotDisplayModel["freshness"];
  reason_codes: SensorSnapshotDisplayModel["reasonCodes"];
  source_detail: string | null;
  metrics: Array<{
    key: SensorSnapshotMetricInput["key"];
    display: string | null;
    unit: string | null;
  }>;
}

export interface QuickLogSensorSnapshotViewModel {
  /** Pure resolved display model for the preview UI. Null when absent. */
  display: SensorSnapshotDisplayModel | null;
  /**
   * "No sensor snapshot available" copy for empty/absent input. Always
   * non-null when `display` is null. Callers should render this verbatim.
   */
  emptyCopy: string | null;
  /**
   * Whether this snapshot may be attached to the Quick Log save payload.
   * Stale / invalid / demo / missing snapshots remain previewable but
   * are not attached as anchored evidence.
   */
  isAttachable: boolean;
  /** Safe attachment payload, or null when not attachable. */
  attachment: QuickLogSensorSnapshotAttachment | null;
  /** Stable warning copy for stale/invalid/missing/demo. Null when fresh. */
  warning: string | null;
}

const EMPTY_COPY = "No sensor snapshot available.";

export function buildQuickLogSensorSnapshotViewModel(
  input: QuickLogSensorContextInput | null | undefined,
  options?: ResolveOptions,
): QuickLogSensorSnapshotViewModel {
  const safe = input ?? {};
  const snapshot = safe.snapshot ?? null;

  if (!snapshot) {
    return {
      display: null,
      emptyCopy: EMPTY_COPY,
      isAttachable: false,
      attachment: null,
      warning: EMPTY_COPY,
    };
  }

  const display = resolveSensorSnapshotDisplay(snapshot, options);

  // Only fresh live/manual/csv are anchored as evidence. Stale, invalid,
  // demo, and unknown remain previewable but are intentionally not
  // attached as healthy anchor context.
  const isAttachable =
    display.freshness === "fresh" &&
    (display.effectiveSource === "live" ||
      display.effectiveSource === "manual" ||
      display.effectiveSource === "csv");

  const attachment: QuickLogSensorSnapshotAttachment | null = isAttachable
    ? {
        source: display.effectiveSource,
        captured_at: display.capturedAt,
        tent_id: toSafeId(safe.tentId),
        plant_id: toSafeId(safe.plantId),
        confidence: display.confidence,
        freshness: display.freshness,
        reason_codes: display.reasonCodes,
        source_detail: display.sourceDetail,
        metrics: display.metrics.map((m) => ({
          key: m.key,
          display: m.display,
          unit: m.unit,
        })),
      }
    : null;

  return {
    display,
    emptyCopy: null,
    isAttachable,
    attachment,
    warning: display.warning,
  };
}

function toSafeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Conservative allow-list: typical uuid or slug shapes only.
  return /^[A-Za-z0-9_.:-]{1,128}$/.test(trimmed) ? trimmed : null;
}

export function isQuickLogSnapshotAttachable(
  vm: QuickLogSensorSnapshotViewModel,
): boolean {
  return vm.isAttachable && vm.attachment !== null;
}
