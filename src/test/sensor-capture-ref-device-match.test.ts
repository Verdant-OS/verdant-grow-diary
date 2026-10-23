/**
 * Device-aware capture identity (#2442 / #2459): legacy rows without device_id
 * must match any device at the same instant and family.
 */
import { describe, expect, it } from "vitest";
import { captureRefIn, captureRefsMatch, sensorCaptureRef } from "@/lib/sensorCaptureRefRules";

const T = "2026-10-22T12:00:00.000Z";
const ms = Date.parse(T);

describe("sensorCaptureRef device suffix", () => {
  it("names device-bound captures and omits empty device ids", () => {
    expect(sensorCaptureRef(T, "live", "gw-a")).toBe(`sensor:${ms}:live:dev:gw-a`);
    expect(sensorCaptureRef(T, "live", "  ")).toBe(`sensor:${ms}:live`);
  });

  it("returns null for invalid sources", () => {
    expect(sensorCaptureRef(T, "invalid")).toBeNull();
  });
});

describe("captureRefsMatch device pairing", () => {
  const legacy = `sensor:${ms}:live`;
  const gwA = `sensor:${ms}:live:dev:gw-a`;
  const gwB = `sensor:${ms}:live:dev:gw-b`;

  it("matches legacy refs to any device at the same instant", () => {
    expect(captureRefsMatch(gwA, legacy)).toBe(true);
    expect(captureRefsMatch(legacy, gwA)).toBe(true);
  });

  it("does not match different devices when both carry device_id", () => {
    expect(captureRefsMatch(gwA, gwB)).toBe(false);
  });

  it("captureRefIn applies the same rules over a list", () => {
    expect(captureRefIn(legacy, [gwB, gwA])).toBe(true);
    expect(captureRefIn(gwB, [gwA])).toBe(false);
  });
});
