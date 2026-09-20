import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { invalidateManualSensorCorrectionReaders } from "@/lib/manualSensorCorrectionCache";

const PREFIXES = [
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
  it("invalidates every sensor-derived reader family and leaves unrelated cache alone", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const familyKeys = PREFIXES.map((prefix) => [...prefix, "tent-a", "owner-a"]);
    const unrelatedKey = ["profile", "owner-a"];
    familyKeys.forEach((key) => client.setQueryData(key, [{ value: 25 }]));
    client.setQueryData(unrelatedKey, { name: "Grower" });

    invalidateManualSensorCorrectionReaders(client);

    familyKeys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
    expect(client.getQueryState(unrelatedKey)?.isInvalidated).toBe(false);
  });
});
