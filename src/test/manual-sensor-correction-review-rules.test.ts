import { describe, expect, it } from "vitest";
import { reviewManualSensorCorrection } from "@/lib/manualSensorCorrectionReviewRules";
import { reviewManualSensorSnapshot } from "@/lib/sensorSnapshotReviewRules";
const options = { now: new Date("2026-09-17T12:00:00Z") };
const input = {
  capturedAt: "2026-09-16T08:00:00.123456+00:00",
  humidity: 60,
  tentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};
describe("historical correction review", () => {
  it("permits a historical correction while retaining time, source and low confidence", () => {
    const result = reviewManualSensorCorrection(input, options);
    expect(result.canSave).toBe(true);
    expect(result.source).toBe("manual");
    expect(result.confidence).toBe("low");
    expect(result.normalizedPreview.capturedAt).toBe(input.capturedAt);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ key: "captured_at_too_old", severity: "warning" }),
    );
    expect(reviewManualSensorSnapshot(input, options).canSave).toBe(false);
  });
  it.each([
    { capturedAt: "invalid" },
    { capturedAt: "2026-09-18T12:00:00Z" },
    { humidity: 150 },
    { tentId: null },
  ])("retains the other blocker: %j", (override) => {
    expect(reviewManualSensorCorrection({ ...input, ...override }, options).canSave).toBe(false);
  });
});
