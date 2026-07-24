import { describe, expect, it } from "vitest";

import { buildPrivateGrowQueryKey, buildPrivateSensorQueryKey } from "@/lib/growDataQueryKeyRules";

describe("private grow query keys", () => {
  it("isolates otherwise-identical private queries by auth subject", () => {
    expect(buildPrivateGrowQueryKey("owner-a", ["tents", "all"])).not.toEqual(
      buildPrivateGrowQueryKey("owner-b", ["tents", "all"]),
    );
  });

  it("keeps the existing grow/resource invalidation prefix", () => {
    expect(buildPrivateGrowQueryKey("owner-a", ["plants", "all", "all"])).toEqual([
      "grow",
      "plants",
      "all",
      "all",
      "owner",
      "owner-a",
    ]);
  });

  it("uses an isolated anonymous identity without inventing authority", () => {
    expect(buildPrivateGrowQueryKey(null, ["sensors", "none"])).toEqual([
      "grow",
      "sensors",
      "none",
      "owner",
      "anonymous",
    ]);
  });
});

describe("private sensor query keys", () => {
  it("isolates identical sensor windows by auth subject", () => {
    expect(buildPrivateSensorQueryKey("owner-a", ["all", 60])).toEqual([
      "sensor_readings",
      "all",
      60,
      "owner",
      "owner-a",
    ]);
    expect(buildPrivateSensorQueryKey("owner-a", ["all", 60])).not.toEqual(
      buildPrivateSensorQueryKey("owner-b", ["all", 60]),
    );
  });

  it("preserves the sensor_readings invalidation prefix", () => {
    expect(buildPrivateSensorQueryKey("owner-a", ["imported_history", "tent-a"])[0]).toBe(
      "sensor_readings",
    );
  });
});
