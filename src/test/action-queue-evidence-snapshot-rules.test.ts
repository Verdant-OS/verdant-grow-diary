/**
 * Action Queue evidence snapshot extract + sanitize metrics.
 */
import { describe, it, expect } from "vitest";
import {
  extractManualSnapshotFromTimelineEvents,
  sanitizeRefMetrics,
  sanitizedMetricsFromSensorSnapshot,
} from "@/lib/actionQueueEvidenceSnapshotRules";
import { buildSensorSnapshotEvidenceRefs } from "@/lib/sensorSnapshotEvidenceRefRules";
import { buildActionEvidenceViewModel } from "@/lib/actionQueueEvidenceViewModel";
import { adaptOriginatingTimelineEventsColumn } from "@/lib/originatingTimelineEventAdapter";

describe("sanitizeRefMetrics", () => {
  it("keeps only allowlisted finite numbers", () => {
    expect(
      sanitizeRefMetrics({
        temperature_c: 24.5,
        humidity_pct: 55,
        evil: 1,
        payload: { a: 1 },
        ph: Number.NaN,
      }),
    ).toEqual({ temperature_c: 24.5, humidity_pct: 55 });
  });

  it("returns null when nothing usable", () => {
    expect(sanitizeRefMetrics(null)).toBeNull();
    expect(sanitizeRefMetrics({ foo: 1 })).toBeNull();
  });
});

describe("sanitizedMetricsFromSensorSnapshot + evidence refs", () => {
  it("attaches metrics onto sensor_snapshot refs", () => {
    const metrics = sanitizedMetricsFromSensorSnapshot({
      temp: 26,
      rh: 50,
      vpd: 1.1,
      soil: null,
      soil_ec: null,
      soil_temp: null,
    });
    const refs = buildSensorSnapshotEvidenceRefs({
      id: "reading-1",
      captured_at: "2026-08-01T12:00:00.000Z",
      source: "manual",
      metric: "temp",
      sanitized_metrics: metrics,
    });
    expect(refs).toHaveLength(1);
    expect(refs[0]?.sanitized_metrics).toEqual({
      temperature_c: 26,
      humidity_pct: 50,
      vpd_kpa: 1.1,
    });
  });

  it("round-trips through adapter", () => {
    const metrics = sanitizedMetricsFromSensorSnapshot({
      temp: 22,
      rh: 60,
      vpd: 0.9,
      soil: 40,
      soil_ec: 1.2,
      soil_temp: 20,
    });
    const refs = buildSensorSnapshotEvidenceRefs({
      id: "r2",
      captured_at: "2026-08-02T00:00:00.000Z",
      source: "live",
      sanitized_metrics: metrics,
    });
    const adapted = adaptOriginatingTimelineEventsColumn(refs);
    expect(adapted[0]?.sanitized_metrics?.temperature_c).toBe(22);
    expect(adapted[0]?.sanitized_metrics).not.toHaveProperty("raw_payload");
  });
});

describe("extractManualSnapshotFromTimelineEvents → quality VM", () => {
  it("extracts snapshot and classifies historical quality", () => {
    const refs = buildSensorSnapshotEvidenceRefs({
      id: "r3",
      captured_at: "2026-08-01T12:00:00.000Z",
      source: "manual",
      sanitized_metrics: {
        temperature_c: 24,
        humidity_pct: 55,
        vpd_kpa: 1.0,
      },
    });
    const snapshot = extractManualSnapshotFromTimelineEvents(refs);
    expect(snapshot).not.toBeNull();
    const vm = buildActionEvidenceViewModel(
      {
        source: "environment_alert",
        action_type: "advisory",
        captured_at: "2026-08-01T12:00:00.000Z",
        snapshot,
      },
      { nowMs: Date.parse("2026-08-07T12:00:00.000Z") },
    );
    expect(vm.hasSnapshotQuality).toBe(true);
    expect(vm.snapshotQuality).not.toBeNull();
    expect(vm.snapshotQuality?.canSupportAiDoctorCurrentContext).toBe(false);
    expect(vm.rowEvidenceStatus).toBe("available");
  });

  it("returns null without metrics (quality unavailable)", () => {
    const refs = buildSensorSnapshotEvidenceRefs({
      id: "r4",
      captured_at: "2026-08-01T12:00:00.000Z",
      source: "manual",
    });
    expect(extractManualSnapshotFromTimelineEvents(refs)).toBeNull();
    const vm = buildActionEvidenceViewModel({
      source: "environment_alert",
      action_type: "advisory",
      captured_at: "2026-08-01T12:00:00.000Z",
      snapshot: null,
    });
    expect(vm.hasSnapshotQuality).toBe(false);
    expect(vm.rowEvidenceStatus).toBe("quality_unavailable");
  });
});
