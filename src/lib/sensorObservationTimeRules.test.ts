import { describe, expect, it } from "vitest";

import { resolveSensorObservationTime } from "@/lib/sensorObservationTimeRules";

describe("resolveSensorObservationTime", () => {
  it("prefers persisted capture time over an import-time ts", () => {
    expect(
      resolveSensorObservationTime({
        captured_at: "2025-01-01T10:00:00Z",
        ts: "2026-07-18T12:00:00Z",
      }),
    ).toBe("2025-01-01T10:00:00Z");
  });

  it("supports the mapped capturedAt spelling and ignores blank values", () => {
    expect(
      resolveSensorObservationTime({
        capturedAt: "2025-01-01T10:00:00Z",
        ts: "2026-07-18T12:00:00Z",
      }),
    ).toBe("2025-01-01T10:00:00Z");
    expect(resolveSensorObservationTime({ captured_at: "  ", ts: "2026-07-18T12:00:00Z" })).toBe(
      "2026-07-18T12:00:00Z",
    );
  });

  it("returns null without a usable timestamp", () => {
    expect(
      resolveSensorObservationTime({ captured_at: null, capturedAt: "", ts: undefined }),
    ).toBeNull();
  });
});
