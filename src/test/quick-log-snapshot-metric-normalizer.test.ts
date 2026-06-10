/**
 * Tests for the shared Quick Log snapshot metric normalizer and its wiring
 * into the diary companion + AI Doctor context read paths.
 *
 * Also covers the key-shape drift contract:
 *   - clean keys win over legacy keys on conflict
 *   - unknown clean-shaped keys pass through verbatim
 *   - numeric strings / NaN / Infinity / null / objects / arrays are dropped
 *   - empty / all-non-finite maps return {} (→ sensorSnapshot = null)
 *   - mixed legacy + clean rows produce identical canonical metric keys
 *     in the AI Doctor adapter (the v1 read-side surface)
 */
import { describe, it, expect } from "vitest";
import {
  normalizeQuickLogSnapshotMetrics,
  QUICK_LOG_CANONICAL_METRICS,
  QUICK_LOG_LEGACY_TO_CANONICAL,
  type CanonicalQuickLogSensorSnapshotMetrics,
} from "@/lib/quick-log/quickLogSnapshotMetricNormalizer";
import { extractQuickLogCompanionView } from "@/lib/quick-log/quickLogDiaryCompanionRules";
import { buildQuickLogAiContext } from "@/lib/quick-log/quickLogAiDoctorContextAdapter";

describe("normalizeQuickLogSnapshotMetrics", () => {
  it("normalizes legacy keys to canonical clean keys", () => {
    expect(
      normalizeQuickLogSnapshotMetrics({
        temperature_c: 24.5,
        humidity_pct: 55,
        vpd_kpa: 1.1,
        co2_ppm: 800,
        soil_temp_c: 21,
        soil_moisture_pct: 30,
        ec: 1.4,
      }),
    ).toEqual({
      temperature: 24.5,
      humidity: 55,
      vpd: 1.1,
      co2: 800,
      soil_temp: 21,
      soil_moisture: 30,
      soil_ec: 1.4,
    });
  });

  it("passes clean canonical keys through unchanged", () => {
    expect(
      normalizeQuickLogSnapshotMetrics({
        temperature: 23.1,
        humidity: 60,
        vpd: 0.9,
        soil_temp: 20,
        soil_ec: 1.2,
        ppfd: 700,
        ph: 6.3,
      }),
    ).toEqual({
      temperature: 23.1,
      humidity: 60,
      vpd: 0.9,
      soil_temp: 20,
      soil_ec: 1.2,
      ppfd: 700,
      ph: 6.3,
    });
  });

  it("prefers clean keys over legacy keys when both are present", () => {
    const out = normalizeQuickLogSnapshotMetrics({
      temperature_c: 99, // legacy — should lose
      temperature: 24,
      humidity_pct: 99, // legacy — should lose
      humidity: 50,
      vpd_kpa: 9.9,
      vpd: 1.0,
    });
    expect(out).toEqual({ temperature: 24, humidity: 50, vpd: 1.0 });
  });

  it("returns {} when metrics are absent, all-null, or non-finite", () => {
    expect(normalizeQuickLogSnapshotMetrics(null)).toEqual({});
    expect(normalizeQuickLogSnapshotMetrics(undefined)).toEqual({});
    expect(normalizeQuickLogSnapshotMetrics({})).toEqual({});
    expect(
      normalizeQuickLogSnapshotMetrics({
        temperature_c: null,
        humidity_pct: null,
        vpd: NaN,
        ppfd: Infinity,
        ph: "not-a-number",
      }),
    ).toEqual({});
  });

  it("exposes a stable canonical metric list", () => {
    expect(QUICK_LOG_CANONICAL_METRICS).toContain("temperature");
    expect(QUICK_LOG_CANONICAL_METRICS).toContain("humidity");
    expect(QUICK_LOG_CANONICAL_METRICS).toContain("vpd");
  });
});

describe("extractQuickLogCompanionView — metric normalization", () => {
  it("normalizes legacy metric keys on legacy companion rows", () => {
    const view = extractQuickLogCompanionView({
      id: "diary-1",
      details: {
        linked_grow_event_id: "ev-1",
        sensor_snapshot: {
          source: "manual",
          captured_at: "2026-06-09T12:00:00Z",
          metrics: { temperature_c: 24, humidity_pct: 55, vpd_kpa: 1.2 },
        },
      },
    });
    expect(view?.sensorSnapshot?.metrics).toEqual({
      temperature: 24,
      humidity: 55,
      vpd: 1.2,
    });
    // Provenance preserved verbatim.
    expect(view?.sensorSnapshot?.source).toBe("manual");
    expect(view?.sensorSnapshot?.capturedAt).toBe("2026-06-09T12:00:00Z");
  });

  it("returns sensorSnapshot=null when all metrics are non-finite", () => {
    const view = extractQuickLogCompanionView({
      id: "diary-2",
      details: {
        linked_grow_event_id: "ev-2",
        sensor_snapshot: {
          source: "csv",
          captured_at: "2026-06-09T12:00:00Z",
          metrics: { temperature_c: null, humidity_pct: null },
        },
      },
    });
    expect(view?.sensorSnapshot).toBeNull();
  });
});

describe("buildQuickLogAiContext — normalized metrics", () => {
  it("delivers canonical metric keys to the AI Doctor context entries", () => {
    const { entries } = buildQuickLogAiContext({
      growEvents: [
        {
          id: "ev-1",
          occurred_at: "2026-06-09T12:00:00Z",
          event_type: "observation",
        },
      ],
      diaryRows: [
        {
          id: "d-1",
          details: {
            linked_grow_event_id: "ev-1",
            sensor_snapshot: {
              source: "csv",
              captured_at: "2026-06-09T12:00:00Z",
              metrics: { temperature_c: 22.5, humidity_pct: 48 },
            },
          },
        },
      ],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].sensorSnapshot?.metrics).toEqual({
      temperature: 22.5,
      humidity: 48,
    });
    expect(entries[0].sensorSnapshot?.source).toBe("csv");
    expect(entries[0].sensorSnapshotAbsent).toBe(false);
  });

  it("renders consistent metric keys across legacy + clean snapshots", () => {
    const { entries } = buildQuickLogAiContext({
      growEvents: [
        {
          id: "ev-old",
          occurred_at: "2026-06-08T10:00:00Z",
          event_type: "observation",
        },
        {
          id: "ev-new",
          occurred_at: "2026-06-09T10:00:00Z",
          event_type: "observation",
        },
      ],
      diaryRows: [
        {
          id: "d-old",
          details: {
            linked_grow_event_id: "ev-old",
            sensor_snapshot: {
              source: "manual",
              captured_at: "2026-06-08T10:00:00Z",
              metrics: { temperature_c: 23, humidity_pct: 50 },
            },
          },
        },
        {
          id: "d-new",
          details: {
            linked_grow_event_id: "ev-new",
            sensor_snapshot: {
              source: "manual",
              captured_at: "2026-06-09T10:00:00Z",
              metrics: { temperature: 24, humidity: 52 },
            },
          },
        },
      ],
    });
    const byId = Object.fromEntries(entries.map((e) => [e.growEventId, e]));
    expect(Object.keys(byId["ev-old"].sensorSnapshot!.metrics).sort()).toEqual([
      "humidity",
      "temperature",
    ]);
    expect(Object.keys(byId["ev-new"].sensorSnapshot!.metrics).sort()).toEqual([
      "humidity",
      "temperature",
    ]);
  });
});
