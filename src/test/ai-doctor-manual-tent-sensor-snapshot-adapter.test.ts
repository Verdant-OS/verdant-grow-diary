import { describe, expect, it } from "vitest";

import { evaluateAiDoctorContext } from "@/lib/aiDoctorContextRules";
import {
  manualTentSensorRowsToAiDoctorContextSnapshots,
  type AiDoctorManualTentSensorRowLike,
} from "@/lib/aiDoctorManualTentSensorSnapshotAdapter";

const NOW = Date.parse("2026-08-14T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const TENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_TENT_ID = "22222222-2222-4222-8222-222222222222";

function reading(
  overrides: Partial<AiDoctorManualTentSensorRowLike> = {},
): AiDoctorManualTentSensorRowLike {
  const capturedAt = new Date(NOW - HOUR).toISOString();
  return {
    tent_id: TENT_ID,
    source: "manual",
    quality: "ok",
    captured_at: capturedAt,
    ts: capturedAt,
    metric: "temperature_c",
    value: 24,
    ...overrides,
  };
}

function adapt(
  rows: readonly AiDoctorManualTentSensorRowLike[],
  existingSnapshots: Parameters<
    typeof manualTentSensorRowsToAiDoctorContextSnapshots
  >[1]["existingSnapshots"] = [],
) {
  return manualTentSensorRowsToAiDoctorContextSnapshots(rows, {
    tentId: TENT_ID,
    now: NOW,
    existingSnapshots,
  });
}

describe("manualTentSensorRowsToAiDoctorContextSnapshots", () => {
  it("groups one multi-metric save into one canonical readiness snapshot", () => {
    const capturedAt = "2026-08-14T06:30:00-05:00";

    expect(
      adapt([
        reading({ metric: "humidity_pct", value: 58, captured_at: capturedAt }),
        reading({ metric: "temperature_c", value: 25, captured_at: capturedAt }),
      ]),
    ).toEqual([{ at: "2026-08-14T11:30:00.000Z", severity: "ok" }]);
  });

  it("uses captured_at before ts so an import timestamp cannot make history look current", () => {
    expect(
      adapt([
        reading({
          captured_at: "2026-08-01T12:00:00.000Z",
          ts: "2026-08-14T11:00:00.000Z",
        }),
      ]),
    ).toEqual([]);
  });

  it("requires an exact tent match", () => {
    expect(
      adapt([
        reading({ tent_id: OTHER_TENT_ID }),
        reading({ tent_id: null }),
        reading({ tent_id: ` ${TENT_ID} ` }),
      ]),
    ).toEqual([]);
  });

  it.each(["live", "stale", "invalid", "demo", "csv", "unknown", "MANUAL", null])(
    "does not relabel source %s as a manual readiness snapshot",
    (source) => {
      expect(adapt([reading({ source })])).toEqual([]);
    },
  );

  it.each(["invalid", "stale", "unknown", "OK", " ok ", null])(
    "rejects persisted quality %s instead of treating it as ok",
    (quality) => {
      expect(adapt([reading({ quality })])).toEqual([]);
    },
  );

  it.each([
    ["temperature_c", 24],
    ["humidity_pct", 55],
    ["vpd_kpa", 1.1],
    ["co2_ppm", 800],
    ["soil_moisture_pct", 45],
    ["ppfd", 600],
  ])("accepts recognized plausible metric %s", (metric, value) => {
    expect(adapt([reading({ metric, value })])).toEqual([
      { at: "2026-08-14T11:00:00.000Z", severity: "ok" },
    ]);
  });

  it.each([
    ["temperature_c", -100],
    ["humidity_pct", 100],
    ["vpd_kpa", 20],
    ["co2_ppm", 10_001],
    ["soil_moisture_pct", 0],
    ["ppfd", 2_501],
  ])("rejects implausible metric %s", (metric, value) => {
    expect(adapt([reading({ metric, value })])).toEqual([]);
  });

  it("requires a recognized finite numeric metric", () => {
    expect(
      adapt([
        reading({ metric: "vendor_secret", value: 24 }),
        reading({ metric: "temperature_c", value: "24" }),
        reading({ metric: "temperature_c", value: Number.NaN }),
        reading({ metric: "temperature_c", value: Number.POSITIVE_INFINITY }),
      ]),
    ).toEqual([]);
  });

  it("fails a cohort closed when a recognized sibling value is implausible", () => {
    const capturedAt = new Date(NOW - HOUR).toISOString();

    expect(
      adapt([
        reading({ metric: "temperature_c", value: 24, captured_at: capturedAt }),
        reading({ metric: "humidity_pct", value: 150, captured_at: capturedAt }),
      ]),
    ).toEqual([]);
  });

  it("keeps the seven-day readiness window and leaves the 48-hour freshness decision to readiness", () => {
    const at30Hours = new Date(NOW - 30 * HOUR).toISOString();
    const at49Hours = new Date(NOW - 49 * HOUR).toISOString();
    const atSevenDays = new Date(NOW - 7 * DAY).toISOString();
    const outsideSevenDays = new Date(NOW - 7 * DAY - 1).toISOString();

    const fresh = adapt([reading({ captured_at: at30Hours })]);
    const recentNotFresh = adapt([reading({ captured_at: at49Hours })]);

    expect(fresh).toEqual([{ at: at30Hours, severity: "ok" }]);
    expect(recentNotFresh).toEqual([{ at: at49Hours, severity: "ok" }]);
    expect(adapt([reading({ captured_at: atSevenDays })])).toHaveLength(1);
    expect(adapt([reading({ captured_at: outsideSevenDays })])).toEqual([]);

    const freshReadiness = evaluateAiDoctorContext({
      plant: null,
      recentManualSnapshots: fresh,
      now: NOW,
    });
    const olderReadiness = evaluateAiDoctorContext({
      plant: null,
      recentManualSnapshots: recentNotFresh,
      now: NOW,
    });
    expect(freshReadiness.evidence).toContain("fresh-manual-sensor-snapshot");
    expect(olderReadiness.evidence).toContain("recent-manual-sensor-snapshot");
    expect(olderReadiness.evidence).not.toContain("fresh-manual-sensor-snapshot");
  });

  it("rejects malformed and future canonical observation times", () => {
    expect(
      adapt([
        reading({ captured_at: "not-a-time" }),
        reading({ captured_at: new Date(NOW + 1).toISOString() }),
        reading({ captured_at: null, ts: "not-a-time" }),
      ]),
    ).toEqual([]);
  });

  it("omits a sensor snapshot when a diary snapshot already owns the same instant", () => {
    const capturedAt = new Date(NOW - HOUR).toISOString();

    expect(
      adapt(
        [reading({ captured_at: capturedAt })],
        [{ at: new Date(capturedAt), severity: "warning" }],
      ),
    ).toEqual([]);
  });

  it("is deterministic across row order and sorts distinct snapshots newest first", () => {
    const newest = new Date(NOW - HOUR).toISOString();
    const oldest = new Date(NOW - 3 * HOUR).toISOString();
    const rows = [
      reading({ metric: "humidity_pct", value: 55, captured_at: oldest }),
      reading({ metric: "temperature_c", value: 24, captured_at: newest }),
      reading({ metric: "temperature_c", value: 23, captured_at: oldest }),
      reading({ metric: "humidity_pct", value: 58, captured_at: newest }),
    ];
    const expected = [
      { at: newest, severity: "ok" as const },
      { at: oldest, severity: "ok" as const },
    ];

    expect(adapt(rows)).toEqual(expected);
    expect(adapt([...rows].reverse())).toEqual(expected);
  });
});
