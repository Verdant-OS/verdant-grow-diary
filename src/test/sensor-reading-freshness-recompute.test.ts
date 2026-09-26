/**
 * Sensor reading freshness recompute — the cached-status recovery fence.
 *
 * `groupSensorReadingRows` classifies each row once, at fetch time, and the
 * status is cached on the mapped `SensorReading`. A presenter that ticks its
 * own clock (Sensor Data, #1677) re-labels the source badge against `now`
 * while `classifySensorReadingTrust` still reads the cached status, so a
 * quality-ok reading captured a few minutes ahead of the clock stays
 * Invalid after the clock catches up, and only a reload repairs it.
 *
 * The mapped reading now retains what the recompute needs — the persisted
 * floor (source / quality) and the sources whose status came from capture
 * time — and `refreshSensorReadingStatus` recomputes only the time-sensitive
 * part. Explicitly invalid, degraded, demo or stale persistence can never be
 * promoted; legacy readings without the retained inputs are returned as-is.
 */
import { describe, expect, it } from "vitest";
import { SENSOR_TRUTH_FUTURE_SKEW_MS } from "@/constants/sensorTruthRanges";
import type { SensorReadingRow } from "@/lib/db";
import {
  groupSensorReadingRows,
  mapSensorReadingRow,
  refreshSensorReadingStatus,
  refreshSensorReadingsStatus,
} from "@/lib/growAdapters";
import { classifySensorReadingTrust } from "@/lib/sensorReadingSelectionRules";
import type { SensorReading } from "@/mock";

const NOW = new Date("2026-09-24T12:00:00.000Z");
const MIN = 60_000;
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();

function row(overrides: Partial<SensorReadingRow> & { captured_at: string }): SensorReadingRow {
  return {
    id: `reading-${overrides.metric ?? "temperature_c"}-${overrides.captured_at}`,
    user_id: "owner-a",
    tent_id: "tent-a",
    source: "live",
    metric: "temperature_c",
    value: 25,
    quality: "ok",
    ts: overrides.captured_at,
    created_at: NOW.toISOString(),
    device_id: null,
    raw_payload: null,
    ...overrides,
  } as SensorReadingRow;
}

describe("refreshSensorReadingStatus — future capture recovers once the clock catches up", () => {
  for (const source of ["live", "manual"] as const) {
    const windowMs = source === "manual" ? 24 * 60 * MIN : 15 * MIN;

    it(`${source} quality-ok reading: invalid at fetch, usable after recovery, stale after its window`, () => {
      const [reading] = groupSensorReadingRows([row({ source, captured_at: at(10 * MIN) })], NOW);
      expect(reading.status).toBe("invalid");
      expect(classifySensorReadingTrust(reading).isInvalid).toBe(true);

      const recovered = refreshSensorReadingStatus(reading, new Date(NOW.getTime() + 6 * MIN));
      expect(recovered.status).toBe("usable");
      expect(classifySensorReadingTrust(recovered)).toEqual({
        isUsable: true,
        isStale: false,
        isInvalid: false,
      });
      // Values, provenance and capture time are preserved; only status moved.
      expect(recovered).toMatchObject({ source, temp: 25, capturedAt: at(10 * MIN) });

      const aged = refreshSensorReadingStatus(
        reading,
        new Date(NOW.getTime() + 10 * MIN + windowMs + 1),
      );
      expect(aged.status).toBe("stale");
      // Exactly at the boundary the reading is still usable.
      expect(
        refreshSensorReadingStatus(reading, new Date(NOW.getTime() + 10 * MIN + windowMs)).status,
      ).toBe("usable");
    });

    it(`${source} explicit quality=invalid stays invalid through recovery and beyond`, () => {
      const [reading] = groupSensorReadingRows(
        [row({ source, quality: "invalid", captured_at: at(10 * MIN) })],
        NOW,
      );
      expect(reading.status).toBe("invalid");
      for (const offset of [0, 6 * MIN, 10 * MIN + windowMs + 1, 48 * 60 * MIN]) {
        const refreshed = refreshSensorReadingStatus(reading, new Date(NOW.getTime() + offset));
        expect(refreshed.status).toBe("invalid");
        expect(refreshed).toBe(reading); // unchanged status → same object
      }
    });

    it(`${source} degraded quality stays needs_review; it is never promoted by time`, () => {
      const [reading] = groupSensorReadingRows(
        [row({ source, quality: "degraded", captured_at: at(-MIN) })],
        NOW,
      );
      expect(reading.status).toBe("needs_review");
      expect(refreshSensorReadingStatus(reading, new Date(NOW.getTime() + 6 * MIN)).status).toBe(
        "needs_review",
      );
    });
  }

  it("single-row mapping retains the same recompute inputs as grouping", () => {
    const single = mapSensorReadingRow(row({ captured_at: at(10 * MIN) }), NOW);
    expect(single.status).toBe("invalid");
    expect(refreshSensorReadingStatus(single, new Date(NOW.getTime() + 6 * MIN)).status).toBe(
      "usable",
    );
  });

  it("persisted stale and demo provenance keep their floor regardless of the clock", () => {
    const [stale] = groupSensorReadingRows([row({ source: "stale", captured_at: at(0) })], NOW);
    const [demo] = groupSensorReadingRows([row({ source: "demo", captured_at: at(0) })], NOW);
    expect(stale.status).toBe("stale");
    expect(demo.status).toBe("needs_review");
    const later = new Date(NOW.getTime() + 6 * MIN);
    expect(refreshSensorReadingStatus(stale, later).status).toBe("stale");
    expect(refreshSensorReadingStatus(demo, later).status).toBe("needs_review");
  });

  it("mixed provenance at one timestamp never promotes past the least-trusted row", () => {
    // A live temperature row and a manual humidity row share one capture time.
    // The live row goes stale after 15 minutes while the manual row would stay
    // usable for 24 hours; the grouped status must follow the live row.
    const capturedAt = at(-MIN);
    const [grouped] = groupSensorReadingRows(
      [
        row({ source: "live", metric: "temperature_c", captured_at: capturedAt }),
        row({ source: "manual", metric: "humidity_pct", value: 55, captured_at: capturedAt }),
      ],
      NOW,
    );
    expect(grouped.status).toBe("usable");
    expect(grouped.source).toBe("manual");
    const afterLiveWindow = new Date(NOW.getTime() + 15 * MIN);
    expect(refreshSensorReadingStatus(grouped, afterLiveWindow).status).toBe("stale");
    // Recompute agrees with what a fresh grouping at that instant would say.
    const [regrouped] = groupSensorReadingRows(
      [
        row({ source: "live", metric: "temperature_c", captured_at: capturedAt }),
        row({ source: "manual", metric: "humidity_pct", value: 55, captured_at: capturedAt }),
      ],
      afterLiveWindow,
    );
    expect(regrouped.status).toBe("stale");
  });

  it("a legacy reading without retained inputs is returned unchanged, never promoted", () => {
    const legacy: SensorReading = {
      ts: at(10 * MIN),
      tentId: "tent-a",
      temp: 25,
      rh: 0,
      vpd: 0,
      co2: 0,
      soil: 0,
      observedMetrics: ["temp"],
      source: "live",
      status: "invalid",
      capturedAt: at(10 * MIN),
    };
    const refreshed = refreshSensorReadingStatus(legacy, new Date(NOW.getTime() + 6 * MIN));
    expect(refreshed).toBe(legacy);
    expect(refreshed.status).toBe("invalid");
  });

  it("tolerates null and undefined readings", () => {
    expect(refreshSensorReadingStatus(null, NOW)).toBeNull();
    expect(refreshSensorReadingStatus(undefined, NOW)).toBeUndefined();
  });

  it("refreshSensorReadingsStatus is deterministic, order-preserving and non-mutating", () => {
    const readings = groupSensorReadingRows(
      [
        row({ captured_at: at(10 * MIN) }),
        row({ quality: "invalid", captured_at: at(9 * MIN) }),
        row({ captured_at: at(-MIN) }),
      ],
      NOW,
    );
    const before = structuredClone(readings);
    const later = new Date(NOW.getTime() + 6 * MIN);
    const first = refreshSensorReadingsStatus(readings, later);
    const second = refreshSensorReadingsStatus(readings, later);
    expect(first).toEqual(second);
    expect(first.map((r) => r.status)).toEqual(["usable", "invalid", "usable"]);
    expect(first.map((r) => r.capturedAt)).toEqual(readings.map((r) => r.capturedAt));
    expect(readings).toEqual(before);
    // Unchanged readings keep their identity so memoised presenters do not churn.
    expect(first[1]).toBe(readings[1]);
    expect(first[2]).toBe(readings[2]);
    // The whole array is returned as-is when nothing changed.
    expect(refreshSensorReadingsStatus(readings, NOW)).toBe(readings);
  });

  it("the future fence is the canonical five-minute skew, not the stale window", () => {
    const [reading] = groupSensorReadingRows(
      [row({ captured_at: at(SENSOR_TRUTH_FUTURE_SKEW_MS + 1) })],
      NOW,
    );
    expect(reading.status).toBe("invalid");
    expect(refreshSensorReadingStatus(reading, new Date(NOW.getTime() + 1)).status).toBe("usable");
  });
});
