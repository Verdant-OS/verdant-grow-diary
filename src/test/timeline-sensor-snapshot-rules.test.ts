import { describe, expect, it } from "vitest";
import { resolveTimelineSensorSnapshot } from "@/lib/timelineSensorSnapshotRules";

describe("resolveTimelineSensorSnapshot", () => {
  it("projects Plant Quick Log manual evidence into Timeline's canonical snapshot shape", () => {
    const snapshot = resolveTimelineSensorSnapshot({
      manual_sensor_snapshot: {
        source: "manual",
        temp_f: 82,
        humidity_percent: 48,
        captured_at: "2026-08-19T17:00:00.000Z",
      },
    });

    expect(snapshot).toMatchObject({
      source: "manual",
      rh: 48,
      ts: "2026-08-19T17:00:00.000Z",
    });
    expect(snapshot?.temp).toBeCloseTo(27.7777777778, 8);
  });

  it("preserves canonical and legacy Quick Log snapshot fields", () => {
    expect(
      resolveTimelineSensorSnapshot({
        sensor_snapshot: { source: "manual", temp: 28, rh: 50, vpd: 1.2 },
        manual_sensor_snapshot: { source: "manual", temp_f: 90, humidity_percent: 60 },
      }),
    ).toEqual({ source: "manual", temp: 28, rh: 50, vpd: 1.2 });

    expect(resolveTimelineSensorSnapshot({ sensor: { temp: 25, rh: 40 } })).toEqual({
      temp: 25,
      rh: 40,
    });
  });

  it("fails closed for null, arrays, invalid values, and empty manual evidence", () => {
    expect(resolveTimelineSensorSnapshot(null)).toBeNull();
    expect(resolveTimelineSensorSnapshot([])).toBeNull();
    expect(resolveTimelineSensorSnapshot({ manual_sensor_snapshot: {} })).toBeNull();
    expect(
      resolveTimelineSensorSnapshot({
        manual_sensor_snapshot: { temp_f: "hot", humidity_percent: Number.NaN },
      }),
    ).toBeNull();
  });
});
