import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  MANUAL_SENSOR_CORRECTION_READER_QUERY_KEY_PREFIXES,
  invalidateManualSensorCorrectionReaders,
} from "@/lib/manualSensorCorrectionCache";

describe("invalidateManualSensorCorrectionReaders", () => {
  it("invalidates every sensor-derived reader family and leaves unrelated cache alone", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const familyKeys = MANUAL_SENSOR_CORRECTION_READER_QUERY_KEY_PREFIXES.map((prefix) => [
      ...prefix,
      "tent-a",
      "owner-a",
    ]);
    const unrelatedKey = ["profile", "owner-a"];
    familyKeys.forEach((key) => client.setQueryData(key, [{ value: 25 }]));
    client.setQueryData(unrelatedKey, { name: "Grower" });

    invalidateManualSensorCorrectionReaders(client);

    familyKeys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
    expect(client.getQueryState(unrelatedKey)?.isInvalidated).toBe(false);
  });
});
