/**
 * Invalid sensor sources name no capture family; rejection checks fall back to instant match (#2303).
 */
import { describe, expect, it } from "vitest";
import { sensorCaptureRef } from "@/lib/sensorCaptureRefRules";

const T = "2026-10-22T12:00:00.000Z";

describe("sensorCaptureRef invalid source", () => {
  it("returns null so explicit invalid siblings still reject by instant", () => {
    expect(sensorCaptureRef(T, "invalid")).toBeNull();
  });
});
