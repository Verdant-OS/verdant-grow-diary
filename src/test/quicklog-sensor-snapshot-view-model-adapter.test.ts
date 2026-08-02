/**
 * Pure unit tests for Quick Log sensor snapshot adapter.
 *
 * Safety contract:
 *  - Empty/loading/error/no-tent/detached → null snapshot (no fake live)
 *  - Canonical sources pass through; sim→demo; diary→manual
 *  - Unknown provider only becomes live when upstream freshness is fresh
 *  - Never invents metrics; °F maps to °C for the view-model unit
 *  - Output never carries raw_payload / private identifiers
 */
import { describe, expect, it } from "vitest";
import { adaptQuickLogSensorContextInput } from "@/lib/quickLogSensorSnapshotViewModelAdapter";
import { EMPTY_SENSOR_SNAPSHOT, type SensorSnapshot } from "@/lib/latestSensorSnapshotRules";

function snapshot(over: Partial<SensorSnapshot> = {}): SensorSnapshot {
  const base: SensorSnapshot = {
    sensor_snapshot_id: "snap-1",
    tent_id: "tent-1",
    captured_at: "2026-08-02T11:55:00.000Z",
    age_minutes: 5,
    source: "live",
    confidence: 0.9,
    freshness: "fresh",
    status: "fresh_live",
    badge_label: "Live",
    metrics: {
      temp_f: 77,
      humidity_pct: 55,
      vpd_kpa: 1.1,
      soil_moisture_pct: 40,
      co2_ppm: null,
    },
    metricDetails: {
      temp_f: { value: 77, valid: true, warn: false, reason: null },
      humidity_pct: { value: 55, valid: true, warn: false, reason: null },
      vpd_kpa: { value: 1.1, valid: true, warn: false, reason: null },
      soil_moisture_pct: { value: 40, valid: true, warn: false, reason: null },
      co2_ppm: { value: null, valid: false, warn: false, reason: null },
    },
    warnings: [],
    usable: true,
  };
  return {
    ...base,
    ...over,
    metrics: { ...base.metrics, ...(over.metrics ?? {}) },
    metricDetails: { ...base.metricDetails, ...(over.metricDetails ?? {}) },
  };
}

describe("adaptQuickLogSensorContextInput — empty collapse", () => {
  it("returns null snapshot when detached, no tent, not ready, or missing capture", () => {
    const ready = { status: "ready" as const, snapshot: snapshot() };

    expect(
      adaptQuickLogSensorContextInput({
        state: ready,
        tentId: "tent-1",
        attached: false,
      }).snapshot,
    ).toBeNull();

    expect(
      adaptQuickLogSensorContextInput({
        state: ready,
        tentId: null,
      }).snapshot,
    ).toBeNull();

    expect(
      adaptQuickLogSensorContextInput({
        state: { status: "loading", snapshot: EMPTY_SENSOR_SNAPSHOT },
        tentId: "tent-1",
      }).snapshot,
    ).toBeNull();

    expect(
      adaptQuickLogSensorContextInput({
        state: { status: "error", snapshot: EMPTY_SENSOR_SNAPSHOT },
        tentId: "tent-1",
      }).snapshot,
    ).toBeNull();

    expect(
      adaptQuickLogSensorContextInput({
        state: {
          status: "ready",
          snapshot: snapshot({ captured_at: null }),
        },
        tentId: "tent-1",
      }).snapshot,
    ).toBeNull();
  });

  it("preserves tentId/plantId even when snapshot collapses", () => {
    const result = adaptQuickLogSensorContextInput({
      state: { status: "empty", snapshot: EMPTY_SENSOR_SNAPSHOT },
      tentId: "tent-9",
      plantId: "plant-2",
    });
    expect(result).toEqual({
      tentId: "tent-9",
      plantId: "plant-2",
      snapshot: null,
    });
  });
});

describe("adaptQuickLogSensorContextInput — source mapping", () => {
  it("passes canonical sources through unchanged", () => {
    for (const source of ["live", "manual", "csv", "demo", "stale", "invalid"] as const) {
      const result = adaptQuickLogSensorContextInput({
        state: {
          status: "ready",
          snapshot: snapshot({ source, freshness: "fresh" }),
        },
        tentId: "tent-1",
      });
      expect(result.snapshot?.source).toBe(source);
      expect(result.snapshot?.sourceDetail).toBe(source);
    }
  });

  it("maps sim→demo and diary→manual", () => {
    expect(
      adaptQuickLogSensorContextInput({
        state: {
          status: "ready",
          snapshot: snapshot({ source: "sim", freshness: "fresh" }),
        },
        tentId: "tent-1",
      }).snapshot?.source,
    ).toBe("demo");

    expect(
      adaptQuickLogSensorContextInput({
        state: {
          status: "ready",
          snapshot: snapshot({ source: "diary", freshness: "fresh" }),
        },
        tentId: "tent-1",
      }).snapshot?.source,
    ).toBe("manual");
  });

  it("never upgrades an unknown provider to live unless upstream freshness is fresh", () => {
    const fresh = adaptQuickLogSensorContextInput({
      state: {
        status: "ready",
        snapshot: snapshot({ source: "ecowitt", freshness: "fresh" }),
      },
      tentId: "tent-1",
    });
    expect(fresh.snapshot?.source).toBe("live");
    expect(fresh.snapshot?.sourceDetail).toBe("ecowitt");

    const stale = adaptQuickLogSensorContextInput({
      state: {
        status: "ready",
        snapshot: snapshot({ source: "ecowitt", freshness: "stale" }),
      },
      tentId: "tent-1",
    });
    expect(stale.snapshot?.source).toBe("stale");

    const unknown = adaptQuickLogSensorContextInput({
      state: {
        status: "ready",
        snapshot: snapshot({ source: "home_assistant", freshness: "unknown" }),
      },
      tentId: "tent-1",
    });
    expect(unknown.snapshot?.source).toBeNull();
    expect(unknown.snapshot?.sourceDetail).toBe("home_assistant");

    const invalid = adaptQuickLogSensorContextInput({
      state: {
        status: "ready",
        snapshot: snapshot({ source: "pi_bridge", freshness: "invalid" }),
      },
      tentId: "tent-1",
    });
    expect(invalid.snapshot?.source).toBeNull();
    expect(invalid.snapshot?.invalid).toBe(true);
  });

  it("null/empty source stays null and does not invent live", () => {
    const result = adaptQuickLogSensorContextInput({
      state: {
        status: "ready",
        snapshot: snapshot({ source: null, freshness: "fresh" }),
      },
      tentId: "tent-1",
    });
    expect(result.snapshot?.source).toBeNull();
    expect(result.snapshot?.sourceDetail).toBeNull();
  });
});

describe("adaptQuickLogSensorContextInput — metrics and safety", () => {
  it("maps temp_f to °C and keeps other metrics", () => {
    const result = adaptQuickLogSensorContextInput({
      state: { status: "ready", snapshot: snapshot() },
      tentId: "tent-1",
      plantId: "plant-1",
    });

    expect(result.tentId).toBe("tent-1");
    expect(result.plantId).toBe("plant-1");
    expect(result.snapshot?.capturedAt).toBe("2026-08-02T11:55:00.000Z");
    expect(result.snapshot?.confidence).toBe(0.9);

    const metrics = result.snapshot?.metrics ?? [];
    const temp = metrics.find((m) => m.key === "temp");
    expect(temp?.unit).toBe("°C");
    expect(temp?.value).toBeCloseTo(25, 5); // 77°F
    expect(metrics.find((m) => m.key === "rh")?.value).toBe(55);
    expect(metrics.find((m) => m.key === "vpd")?.value).toBe(1.1);
    expect(metrics.find((m) => m.key === "soil")?.value).toBe(40);
    // co2 is null upstream → omitted, never invented as zero (co2 not a SensorSnapshotMetricKey)
    expect(metrics.map((m) => m.key as string)).not.toContain("co2");
  });

  it("omits null metrics rather than inventing zeros", () => {
    const result = adaptQuickLogSensorContextInput({
      state: {
        status: "ready",
        snapshot: snapshot({
          metrics: {
            temp_f: null,
            humidity_pct: null,
            vpd_kpa: null,
            soil_moisture_pct: null,
            co2_ppm: null,
          },
        }),
      },
      tentId: "tent-1",
    });
    expect(result.snapshot?.metrics).toEqual([]);
  });

  it("never surfaces raw_payload or private keys on the adapted object", () => {
    const result = adaptQuickLogSensorContextInput({
      state: {
        status: "ready",
        snapshot: snapshot(),
      },
      tentId: "tent-1",
    });
    const json = JSON.stringify(result);
    expect(json).not.toContain("raw_payload");
    expect(json).not.toContain("bridge_token");
    expect(json).not.toContain("service_role");
    expect(Object.keys(result.snapshot ?? {})).toEqual(
      expect.arrayContaining([
        "source",
        "sourceDetail",
        "capturedAt",
        "confidence",
        "invalid",
        "metrics",
      ]),
    );
  });
});
