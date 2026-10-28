import { describe, expect, it } from "vitest";
import { MANUAL_READING_OBSERVED_AT_LOOKBACK_MS } from "@/lib/manualSensorObservedAtRules";
import { reviewManualSensorCorrection } from "@/lib/manualSensorCorrectionReviewRules";
import { reviewManualSensorSnapshot } from "@/lib/sensorSnapshotReviewRules";

const NOW = new Date("2026-07-09T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_STALE_BLOCK_MESSAGE =
  "Capture time is older than 24h — save as historical import instead.";

const INPUT = {
  tempF: 75,
  humidity: 55,
  capturedAt: "2026-07-09T11:55:00.000Z",
  tentId: "tent-1",
} as const;

describe("manual reading review window", () => {
  it("keeps the 24h blocker when staleBlockMs is omitted", () => {
    const tooOld = reviewManualSensorSnapshot(
      { ...INPUT, capturedAt: "2026-07-07T00:00:00.000Z" },
      { now: NOW },
    );
    expect(tooOld.canSave).toBe(false);
    expect(tooOld.findings).toContainEqual(
      expect.objectContaining({
        key: "captured_at_too_old",
        severity: "blocker",
        message: DEFAULT_STALE_BLOCK_MESSAGE,
      }),
    );

    const at24h = reviewManualSensorSnapshot(
      { ...INPUT, capturedAt: new Date(NOW.getTime() - 24 * HOUR_MS).toISOString() },
      { now: NOW },
    );
    expect(at24h.findings.some((finding) => finding.key === "captured_at_too_old")).toBe(false);

    const past24h = reviewManualSensorSnapshot(
      { ...INPUT, capturedAt: new Date(NOW.getTime() - 24 * HOUR_MS - 1).toISOString() },
      { now: NOW },
    );
    expect(past24h.canSave).toBe(false);
    expect(
      past24h.findings.some(
        (finding) => finding.key === "captured_at_too_old" && finding.severity === "blocker",
      ),
    ).toBe(true);
  });

  it("allows a new reading inside 7 days and blocks one millisecond past it", () => {
    const inside = reviewManualSensorSnapshot(
      { ...INPUT, capturedAt: new Date(NOW.getTime() - 3 * 24 * HOUR_MS).toISOString() },
      { now: NOW, staleBlockMs: MANUAL_READING_OBSERVED_AT_LOOKBACK_MS },
    );
    expect(inside.canSave).toBe(true);
    expect(inside.findings.some((finding) => finding.key === "captured_at_too_old")).toBe(false);
    expect(
      inside.findings.some(
        (finding) => finding.key === "captured_at_stale" && finding.severity === "warning",
      ),
    ).toBe(true);

    const atLookback = reviewManualSensorSnapshot(
      {
        ...INPUT,
        capturedAt: new Date(NOW.getTime() - MANUAL_READING_OBSERVED_AT_LOOKBACK_MS).toISOString(),
      },
      { now: NOW, staleBlockMs: MANUAL_READING_OBSERVED_AT_LOOKBACK_MS },
    );
    expect(atLookback.canSave).toBe(true);
    expect(atLookback.findings.some((finding) => finding.key === "captured_at_too_old")).toBe(
      false,
    );

    const pastLookback = reviewManualSensorSnapshot(
      {
        ...INPUT,
        capturedAt: new Date(
          NOW.getTime() - MANUAL_READING_OBSERVED_AT_LOOKBACK_MS - 1,
        ).toISOString(),
      },
      { now: NOW, staleBlockMs: MANUAL_READING_OBSERVED_AT_LOOKBACK_MS },
    );
    expect(pastLookback.canSave).toBe(false);
    expect(
      pastLookback.findings.some(
        (finding) => finding.key === "captured_at_too_old" && finding.severity === "blocker",
      ),
    ).toBe(true);
    expect(
      pastLookback.findings.find((finding) => finding.key === "captured_at_too_old")?.message,
    ).toContain("7 days");
  });

  it("keeps corrections on the 24h block for a reading inside the 7-day lookback", () => {
    const options = { now: new Date("2026-09-17T12:00:00Z") };
    const input = {
      capturedAt: "2026-09-16T08:00:00.123456+00:00",
      humidity: 60,
      tentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    };
    const correction = reviewManualSensorCorrection(input, options);
    expect(correction.canSave).toBe(true);
    expect(correction.findings).toContainEqual(
      expect.objectContaining({ key: "captured_at_too_old", severity: "warning" }),
    );
    expect(
      correction.findings.find((finding) => finding.key === "captured_at_too_old")?.message,
    ).toMatch(/cannot support current-room guidance/);
    expect(reviewManualSensorSnapshot(input, options).canSave).toBe(false);

    const widened = reviewManualSensorSnapshot(input, {
      ...options,
      staleBlockMs: MANUAL_READING_OBSERVED_AT_LOOKBACK_MS,
    });
    expect(widened.canSave).toBe(true);
    expect(widened.findings.some((finding) => finding.key === "captured_at_too_old")).toBe(false);
  });
});
