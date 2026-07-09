/**
 * manualSensorCorrectionContext — pure encoder/decoder tests.
 */
import { describe, it, expect } from "vitest";
import {
  encodeManualCorrectionHash,
  decodeManualCorrectionHash,
  hasCorrectableOriginalIds,
  type ManualCorrectionContext,
} from "@/lib/manualSensorCorrectionContext";

const TENT = "11111111-1111-4111-8111-111111111111";
const R_TEMP = "22222222-2222-4222-8222-222222222222";
const R_RH = "33333333-3333-4333-8333-333333333333";

const CTX: ManualCorrectionContext = {
  tentId: TENT,
  originalCapturedAt: "2026-07-01T12:00:00.000Z",
  originalReadingIds: { temperature_c: R_TEMP, humidity_pct: R_RH },
  originalValues: { temperature_c: 24.5, humidity_pct: 58 },
};

describe("manualSensorCorrectionContext", () => {
  it("round-trips a full correction context via the URL hash", () => {
    const hash = encodeManualCorrectionHash(CTX);
    expect(hash.startsWith("#manual-reading?")).toBe(true);
    const back = decodeManualCorrectionHash(hash);
    expect(back).not.toBeNull();
    expect(back!.tentId).toBe(TENT);
    expect(back!.originalCapturedAt).toBe(CTX.originalCapturedAt);
    expect(back!.originalReadingIds.temperature_c).toBe(R_TEMP);
    expect(back!.originalReadingIds.humidity_pct).toBe(R_RH);
    expect(back!.originalValues.temperature_c).toBe(24.5);
    expect(back!.originalValues.humidity_pct).toBe(58);
  });

  it("returns null when there are zero original reading IDs", () => {
    const hash = encodeManualCorrectionHash({
      ...CTX,
      originalReadingIds: {},
    });
    expect(decodeManualCorrectionHash(hash)).toBeNull();
  });

  it("rejects non-UUID tent_id", () => {
    const bad = "#manual-reading?correct=1&tent_id=not-a-uuid&captured_at=2026-07-01T12:00:00.000Z&r_temperature_c=" + R_TEMP;
    expect(decodeManualCorrectionHash(bad)).toBeNull();
  });

  it("rejects non-UUID reading ids (never infers)", () => {
    const bad = `#manual-reading?correct=1&tent_id=${TENT}&captured_at=2026-07-01T12:00:00.000Z&r_temperature_c=not-a-uuid`;
    expect(decodeManualCorrectionHash(bad)).toBeNull();
  });

  it("returns null for unrelated hashes", () => {
    expect(decodeManualCorrectionHash("#other")).toBeNull();
    expect(decodeManualCorrectionHash("")).toBeNull();
    expect(decodeManualCorrectionHash(null)).toBeNull();
  });

  it("hasCorrectableOriginalIds is true only when a real UUID is present", () => {
    expect(hasCorrectableOriginalIds({ temperature_c: R_TEMP })).toBe(true);
    expect(hasCorrectableOriginalIds({})).toBe(false);
    expect(hasCorrectableOriginalIds({ temperature_c: "not-a-uuid" })).toBe(false);
    expect(hasCorrectableOriginalIds(null)).toBe(false);
    expect(hasCorrectableOriginalIds(undefined)).toBe(false);
  });
});
