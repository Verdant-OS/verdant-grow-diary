import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { invalidateManualSensorCorrectionReaders } from "@/lib/manualSensorCorrectionCache";

const readerFamilies = [
  ["grow", "sensors"],
  ["sensor_readings"],
  ["latest-sensor-snapshot"],
  ["plant-tent-environment"],
  ["environment-trends"],
  ["diary-range-report"],
  ["sensor", "latest"],
  ["reports-hub"],
  ["post-grow-report"],
] as const;

describe("invalidateManualSensorCorrectionReaders", () => {
  it("invalidates every historical sensor reader family without partial prefix drift", () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    invalidateManualSensorCorrectionReaders(client);
    expect(invalidate).toHaveBeenCalledTimes(readerFamilies.length);
    expect(invalidate.mock.calls.map(([args]) => args?.queryKey)).toEqual([...readerFamilies]);
  });

  it("does not invent new query keys when a correction invalidates readers", () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    invalidateManualSensorCorrectionReaders(client);
    for (const call of invalidate.mock.calls) {
      expect(call[0]?.exact).toBeUndefined();
      expect(Array.isArray(call[0]?.queryKey)).toBe(true);
    }
  });
});
