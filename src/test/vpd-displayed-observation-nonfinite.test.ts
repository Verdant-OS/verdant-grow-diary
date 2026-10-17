import { describe, expect, it } from "vitest";
import { resolveDisplayedVpdObservation } from "@/lib/vpdStabilityInputRules";

const NOW_MS = Date.parse("2026-10-15T12:00:00.000Z");

describe("resolveDisplayedVpdObservation non-finite snapshot", () => {
  it("uses the series fallback when the stored snapshot VPD is not finite", () => {
    expect(
      resolveDisplayedVpdObservation({
        snapshotVpd: Number.NaN,
        snapshotCapturedAt: "2026-10-15T11:40:00.000Z",
        snapshotSource: "live",
        snapshotStale: false,
        fallback: {
          ts: "2026-10-15T11:55:00.000Z",
          vpd: 1.2,
          source: "manual",
          stale: false,
        },
        nowMs: NOW_MS,
      }),
    ).toEqual({
      value: 1.2,
      capturedAt: "2026-10-15T11:55:00.000Z",
      source: "manual",
      stale: false,
    });
  });
});
