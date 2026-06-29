/**
 * Per-Metric Sensor Evidence Refs v1 — `snapshotFromReadings` carries
 * the exact contributing `sensor_readings.id` (+ ts + source) per metric
 * via `SensorSnapshot.metric_refs`. No inference, no fake provenance.
 */
import { describe, expect, it } from "vitest";
import {
  snapshotFromReadings,
  snapshotFromDiary,
  type SensorReadingLike,
} from "@/lib/sensorSnapshot";

const TS = "2026-06-29T12:00:00Z";

function row(
  metric: string,
  value: number,
  extra: Partial<SensorReadingLike> = {},
): SensorReadingLike {
  return { ts: TS, metric, value, source: "live", ...extra };
}

describe("snapshotFromReadings — metric_refs population", () => {
  it("emits a metric_refs entry for each latest row that carries an id", () => {
    const snap = snapshotFromReadings([
      row("temperature_c", 24, { id: "row-temp-1" }),
      row("humidity_pct", 55, { id: "row-rh-1" }),
      row("vpd_kpa", 1.0, { id: "row-vpd-1", source: "manual" }),
    ]);
    expect(snap).not.toBeNull();
    expect(snap!.metric_refs).toEqual({
      temp: { id: "row-temp-1", captured_at: TS, source: "live" },
      rh: { id: "row-rh-1", captured_at: TS, source: "live" },
      vpd: { id: "row-vpd-1", captured_at: TS, source: "manual" },
    });
    // Existing values preserved.
    expect(snap!.temp).toBe(24);
    expect(snap!.rh).toBe(55);
    expect(snap!.vpd).toBe(1);
  });

  it("omits metric_refs entry when the contributing row has no id", () => {
    const snap = snapshotFromReadings([
      row("temperature_c", 24, { id: "row-temp-1" }),
      row("humidity_pct", 55), // no id
    ]);
    expect(snap!.metric_refs).toEqual({
      temp: { id: "row-temp-1", captured_at: TS, source: "live" },
    });
    expect(snap!.metric_refs!.rh).toBeUndefined();
  });

  it("omits metric_refs entirely when no row carries an id (back-compat)", () => {
    const snap = snapshotFromReadings([
      row("temperature_c", 24),
      row("humidity_pct", 55),
    ]);
    expect(snap!.metric_refs).toBeUndefined();
  });

  it("uses the same row that `get(metric)` selects when duplicates exist", () => {
    // Existing get() takes first match. metric_refs must match the same row.
    const snap = snapshotFromReadings([
      row("temperature_c", 24, { id: "first-temp" }),
      row("temperature_c", 99, { id: "second-temp" }),
    ]);
    expect(snap!.temp).toBe(24);
    expect(snap!.metric_refs!.temp).toEqual({
      id: "first-temp",
      captured_at: TS,
      source: "live",
    });
  });

  it("only considers rows at the latest ts (never older rows)", () => {
    const older = "2026-06-29T10:00:00Z";
    const snap = snapshotFromReadings([
      row("temperature_c", 24, { id: "new-temp" }),
      { ts: older, metric: "humidity_pct", value: 50, source: "live", id: "old-rh" },
    ]);
    expect(snap!.metric_refs).toEqual({
      temp: { id: "new-temp", captured_at: TS, source: "live" },
    });
    expect(snap!.metric_refs!.rh).toBeUndefined();
  });

  it("ignores ids on unmapped metrics (e.g. co2)", () => {
    const snap = snapshotFromReadings([
      row("co2_ppm", 800, { id: "row-co2-1" }),
      row("temperature_c", 24, { id: "row-temp-1" }),
    ]);
    // co2 has no MetricKey, so no metric_refs entry exists for it.
    expect(snap!.metric_refs).toEqual({
      temp: { id: "row-temp-1", captured_at: TS, source: "live" },
    });
    expect((snap!.metric_refs as Record<string, unknown>).co2).toBeUndefined();
  });

  it("does not copy raw_payload into metric_refs", () => {
    const snap = snapshotFromReadings([
      row("temperature_c", 24, {
        id: "row-temp-1",
        raw_payload: { secret: "leak", api_key: "x" },
      }),
    ]);
    expect(snap!.metric_refs!.temp).toEqual({
      id: "row-temp-1",
      captured_at: TS,
      source: "live",
    });
    expect(JSON.stringify(snap!.metric_refs)).not.toContain("secret");
    expect(JSON.stringify(snap!.metric_refs)).not.toContain("api_key");
  });
});

describe("snapshotFromDiary — never populates metric_refs", () => {
  it("legacy flat shape has no metric_refs", () => {
    const snap = snapshotFromDiary("2026-06-29T12:00:00Z", {
      ts: TS,
      temp: 24,
      rh: 55,
    });
    expect(snap!.metric_refs).toBeUndefined();
  });

  it("quick-log metrics shape has no metric_refs", () => {
    const snap = snapshotFromDiary("2026-06-29T12:00:00Z", {
      captured_at: TS,
      metrics: { temperature: 24, humidity: 55 },
    });
    expect(snap!.metric_refs).toBeUndefined();
  });
});
