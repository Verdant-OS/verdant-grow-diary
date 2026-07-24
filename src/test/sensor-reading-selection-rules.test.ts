import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SensorReading } from "@/mock";
import {
  classifySensorReadingTrust,
  indexSensorReadingsByObservedMetric,
  selectLatestSensorReading,
  selectLatestTrustedVpdInputs,
  selectRecentSensorReadings,
  readObservedSensorMetric,
  readTrustedVpdInputs,
  selectReadingsWithObservedMetric,
  selectRecentObservedSensorValues,
  sortSensorReadingsNewestFirst,
} from "@/lib/sensorReadingSelectionRules";

function reading(ts: string, soil: number, overrides: Partial<SensorReading> = {}): SensorReading {
  return {
    ts,
    capturedAt: ts,
    tentId: "11111111-1111-4111-8111-111111111111",
    temp: 24,
    rh: 55,
    vpd: 1.2,
    co2: 800,
    soil,
    source: "live",
    status: "usable",
    ...overrides,
  };
}

describe("sensor reading selection rules", () => {
  it("selects the newest timestamp regardless of input order", () => {
    const oldest = reading("2026-07-18T08:00:00.000Z", 10);
    const newest = reading("2026-07-18T10:00:00.000Z", 30);
    const middle = reading("2026-07-18T09:00:00.000Z", 20);

    expect(selectLatestSensorReading([newest, oldest, middle])).toBe(newest);
    expect(selectLatestSensorReading([oldest, middle, newest])).toBe(newest);
  });

  it("returns the newest requested window for soil stuck-value checks", () => {
    const rows = [
      reading("2026-07-18T07:00:00.000Z", 1),
      reading("2026-07-18T10:00:00.000Z", 4),
      reading("2026-07-18T08:00:00.000Z", 2),
      reading("2026-07-18T09:00:00.000Z", 3),
    ];

    expect(selectRecentSensorReadings(rows, 3).map((row) => row.soil)).toEqual([4, 3, 2]);
  });

  it("uses captured time as an explicit equal-ts tie-breaker", () => {
    const earlierCapture = reading("2026-07-18T10:00:00.000Z", 1, {
      capturedAt: "2026-07-18T09:59:00.000Z",
    });
    const laterCapture = reading("2026-07-18T10:00:00.000Z", 2, {
      capturedAt: "2026-07-18T10:00:00.000Z",
    });

    expect(sortSensorReadingsNewestFirst([earlierCapture, laterCapture])).toEqual([
      laterCapture,
      earlierCapture,
    ]);
  });

  it("uses physical capture time before a later CSV import timestamp", () => {
    const importedOldHistory = reading("2026-07-18T12:00:00.000Z", 30, {
      capturedAt: "2026-07-17T10:00:00.000Z",
      source: "csv",
    });
    const currentLiveReading = reading("2026-07-18T10:00:00.000Z", 40, {
      capturedAt: "2026-07-18T10:00:00.000Z",
      source: "live",
    });

    expect(sortSensorReadingsNewestFirst([importedOldHistory, currentLiveReading])).toEqual([
      currentLiveReading,
      importedOldHistory,
    ]);
  });

  it("is repeatable when equal timestamps and capture times arrive in different orders", () => {
    const live = reading("2026-07-18T10:00:00.000Z", 40, { source: "live" });
    const manual = reading("2026-07-18T10:00:00.000Z", 40, { source: "manual" });

    const forward = sortSensorReadingsNewestFirst([live, manual]).map((row) => row.source);
    const reverse = sortSensorReadingsNewestFirst([manual, live]).map((row) => row.source);
    expect(forward).toEqual(reverse);
  });

  it("includes observed metrics and confidence in deterministic exact-time ties", () => {
    const sparseLowerConfidence = reading("2026-07-18T10:00:00.000Z", 40, {
      observedMetrics: ["temp"],
      confidence: 0.5,
    });
    const completeHigherConfidence = reading("2026-07-18T10:00:00.000Z", 40, {
      observedMetrics: ["rh", "temp"],
      confidence: 0.9,
    });

    const signature = (row: SensorReading) =>
      `${row.observedMetrics?.join(",") ?? "legacy"}|${row.confidence ?? ""}`;
    const forward = sortSensorReadingsNewestFirst([
      sparseLowerConfidence,
      completeHigherConfidence,
    ]).map(signature);
    const reverse = sortSensorReadingsNewestFirst([
      completeHigherConfidence,
      sparseLowerConfidence,
    ]).map(signature);

    expect(forward).toEqual(reverse);
  });

  it("sorts malformed timestamps behind valid evidence", () => {
    const invalid = reading("not-a-date", 99, { capturedAt: "not-a-date" });
    const valid = reading("2026-07-18T10:00:00.000Z", 30);
    expect(sortSensorReadingsNewestFirst([invalid, valid])).toEqual([valid, invalid]);
  });

  it("is null-safe and does not mutate the caller array", () => {
    const older = reading("2026-07-18T08:00:00.000Z", 10);
    const newer = reading("2026-07-18T10:00:00.000Z", 30);
    const input = [older, newer];

    expect(sortSensorReadingsNewestFirst(input)).toEqual([newer, older]);
    expect(input).toEqual([older, newer]);
    expect(selectLatestSensorReading(null)).toBeNull();
  });

  it("fails closed for non-positive or invalid limits", () => {
    const rows = [reading("2026-07-18T10:00:00.000Z", 30)];
    expect(selectRecentSensorReadings(rows, 0)).toEqual([]);
    expect(selectRecentSensorReadings(rows, -1)).toEqual([]);
    expect(selectRecentSensorReadings(rows, Number.NaN)).toEqual([]);
  });

  it("uses deterministic content tie-breakers when both timestamps are malformed", () => {
    const live = reading("not-a-date", 40, {
      capturedAt: "also-not-a-date",
      source: "live",
    });
    const manual = reading("not-a-date", 40, {
      capturedAt: "also-not-a-date",
      source: "manual",
    });

    const forward = sortSensorReadingsNewestFirst([live, manual]).map((row) => row.source);
    const reverse = sortSensorReadingsNewestFirst([manual, live]).map((row) => row.source);
    expect(forward).toEqual(reverse);
  });

  it("does not turn compatibility zeroes into observed soil evidence", () => {
    const tempOnlyNewest = reading("2026-07-18T12:00:00.000Z", 0, {
      observedMetrics: ["temp", "rh"],
    });
    const tempOnlyMiddle = reading("2026-07-18T11:00:00.000Z", 0, {
      observedMetrics: ["temp"],
    });
    const soilOlder = reading("2026-07-18T10:00:00.000Z", 44, {
      observedMetrics: ["soil"],
    });
    const soilOldest = reading("2026-07-18T09:00:00.000Z", 41, {
      observedMetrics: ["soil"],
    });
    const rows = [soilOldest, tempOnlyMiddle, soilOlder, tempOnlyNewest];

    expect(selectRecentObservedSensorValues(rows, "soil", 3)).toEqual([44, 41]);
    expect(selectReadingsWithObservedMetric(rows, "soil")).toEqual([soilOlder, soilOldest]);
    expect(readObservedSensorMetric(tempOnlyNewest, "soil")).toBeNull();
  });

  it("treats pre-metadata explicit snapshots as observed for compatibility", () => {
    const legacy = reading("2026-07-18T12:00:00.000Z", 52);
    expect(readObservedSensorMetric(legacy, "soil")).toBe(52);
  });

  it("derives VPD inputs only from one usable snapshot with both observed metrics", () => {
    const usable = reading("2026-07-18T12:00:00.000Z", 52, {
      observedMetrics: ["temp", "rh"],
      temp: 24,
      rh: 55,
    });
    const sparse = reading("2026-07-18T12:00:00.000Z", 52, {
      observedMetrics: ["temp"],
      temp: 24,
      rh: 55,
    });
    const stale = reading("2026-07-18T12:00:00.000Z", 52, {
      observedMetrics: ["temp", "rh"],
      source: "stale",
      status: "stale",
    });
    const invalid = reading("2026-07-18T12:00:00.000Z", 52, {
      observedMetrics: ["temp", "rh"],
      source: "invalid",
      status: "invalid",
    });
    const csv = reading("2026-07-18T12:00:00.000Z", 52, {
      observedMetrics: ["temp", "rh"],
      source: "csv",
      status: "usable",
    });
    const manual = reading("2026-07-18T12:00:00.000Z", 52, {
      observedMetrics: ["temp", "rh"],
      source: "manual",
      status: "usable",
    });

    expect(readTrustedVpdInputs(usable)).toEqual({ temperatureC: 24, humidityPct: 55 });
    expect(readTrustedVpdInputs(sparse)).toBeNull();
    expect(readTrustedVpdInputs(stale)).toBeNull();
    expect(readTrustedVpdInputs(invalid)).toBeNull();
    expect(readTrustedVpdInputs(csv)).toBeNull();
    expect(readTrustedVpdInputs(manual)).toEqual({ temperatureC: 24, humidityPct: 55 });
  });

  it("finds the newest usable complete VPD inputs past newer sparse and stale rows", () => {
    const newestSparseSoil = reading("2026-07-18T13:00:00.000Z", 48, {
      observedMetrics: ["soil"],
    });
    const newerStaleComplete = reading("2026-07-18T12:00:00.000Z", 45, {
      observedMetrics: ["temp", "rh"],
      source: "stale",
      status: "stale",
      temp: 30,
      rh: 80,
    });
    const expectedManual = reading("2026-07-18T11:00:00.000Z", 44, {
      observedMetrics: ["temp", "rh"],
      source: "manual",
      temp: 25,
      rh: 60,
    });

    expect(
      selectLatestTrustedVpdInputs([expectedManual, newestSparseSoil, newerStaleComplete]),
    ).toEqual({ temperatureC: 25, humidityPct: 60, reading: expectedManual });
  });

  it("sorts once into deterministic per-metric reading indexes", () => {
    const newestTempOnly = reading("2026-07-18T12:00:00.000Z", 0, {
      observedMetrics: ["temp"],
    });
    const olderTempAndRh = reading("2026-07-18T11:00:00.000Z", 0, {
      observedMetrics: ["temp", "rh"],
    });
    const soilOnly = reading("2026-07-18T10:00:00.000Z", 47, {
      observedMetrics: ["soil"],
    });

    const index = indexSensorReadingsByObservedMetric([soilOnly, olderTempAndRh, newestTempOnly]);
    expect(index.temp).toEqual([newestTempOnly, olderTempAndRh]);
    expect(index.rh).toEqual([olderTempAndRh]);
    expect(index.soil).toEqual([soilOnly]);
    expect(index.vpd).toEqual([]);
  });

  it("maps canonical snapshot status and source into fail-closed presenter flags", () => {
    expect(classifySensorReadingTrust(reading("2026-07-18T12:00:00.000Z", 52))).toEqual({
      isUsable: true,
      isStale: false,
      isInvalid: false,
    });
    expect(
      classifySensorReadingTrust(
        reading("2026-07-18T12:00:00.000Z", 52, { source: "stale", status: "stale" }),
      ),
    ).toEqual({ isUsable: false, isStale: true, isInvalid: false });
    expect(
      classifySensorReadingTrust(
        reading("2026-07-18T12:00:00.000Z", 52, {
          source: "invalid",
          status: "needs_review",
        }),
      ),
    ).toEqual({ isUsable: false, isStale: false, isInvalid: true });
  });
});

describe("Sensors page reading-selection wiring", () => {
  const source = readFileSync(resolve(process.cwd(), "src/pages/Sensors.tsx"), "utf8");

  it("defensively sorts snapshots and takes the first row as latest", () => {
    expect(source).toMatch(/sortSensorReadingsNewestFirst/);
    expect(source).toMatch(/const latest = filtered\[0\] \?\? null/);
    expect(source).not.toMatch(/filtered\[filtered\.length\s*-\s*1\]/);
  });

  it("uses the newest three readings for soil boundary detection", () => {
    expect(source).toMatch(/indexSensorReadingsByObservedMetric\(filtered\)/);
    expect(source).toMatch(/readingsByMetric\.soil/);
    expect(source).toMatch(/m\.key === "soil" \? recentSoilValues/);
    expect(source).not.toMatch(/filtered\.slice\(-3\)/);
  });

  it("never treats missing provenance as demo on the authenticated sensor page", () => {
    expect(source).not.toMatch(/options=\{\{\s*fallback:\s*["']demo["']/);
  });

  it("gates derived VPD and forwards stale/invalid trust flags", () => {
    expect(source).toMatch(/selectLatestTrustedVpdInputs\(filtered\)/);
    expect(source).toMatch(/const displayedVpdKpa = latestObservedVpd \?\? derivedVpdKpa/);
    expect(source).toMatch(/displayedVpdKpa !== null/);
    expect(source).toMatch(/isStale:\s*metricTrust\.isStale/);
    expect(source).toMatch(/isInvalid:\s*metricTrust\.isInvalid/);
  });
});
