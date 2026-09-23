/**
 * Resolved-value contract for manualSensorCorrectionCache.
 *
 * A confirmed correction must invalidate every sensor reader family; drift
 * between this list and hook subscribers would leave stale evidence visible.
 */
import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  MANUAL_SENSOR_CORRECTION_READER_QUERY_KEY_PREFIXES,
  invalidateManualSensorCorrectionReaders,
} from "@/lib/manualSensorCorrectionCache";

describe("MANUAL_SENSOR_CORRECTION_READER_QUERY_KEY_PREFIXES", () => {
  it("covers every reader family invalidated after a confirmed correction", () => {
    expect(MANUAL_SENSOR_CORRECTION_READER_QUERY_KEY_PREFIXES).toEqual([
      ["grow", "sensors"],
      ["sensor_readings"],
      ["latest-sensor-snapshot"],
      ["plant-tent-environment"],
      ["environment-trends"],
      ["diary-range-report"],
      ["sensor", "latest"],
      ["reports-hub"],
      ["post-grow-report"],
    ]);
  });

  it("uses unique prefixes so one invalidation cannot mask a missing family", () => {
    const serialized = MANUAL_SENSOR_CORRECTION_READER_QUERY_KEY_PREFIXES.map((key) =>
      JSON.stringify(key),
    );
    expect(new Set(serialized).size).toBe(serialized.length);
  });
});

describe("invalidateManualSensorCorrectionReaders", () => {
  it("invalidates each configured prefix exactly once", () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    invalidateManualSensorCorrectionReaders(client);

    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      ...MANUAL_SENSOR_CORRECTION_READER_QUERY_KEY_PREFIXES,
    ]);
    expect(invalidate).toHaveBeenCalledTimes(
      MANUAL_SENSOR_CORRECTION_READER_QUERY_KEY_PREFIXES.length,
    );
  });
});
