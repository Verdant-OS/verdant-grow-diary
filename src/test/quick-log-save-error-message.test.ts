/**
 * quickLogSaveErrorMessage — operator copy for the canonical sensor bands.
 *
 * The three air-sensor reason codes must map to calm, specific copy that
 * states the accepted band AND unit, never the raw code, and never the
 * generic fallback.
 */
import { describe, it, expect } from "vitest";
import { quickLogReasonToOperatorMessage } from "@/lib/quickLogSaveErrorMessage";

const GENERIC = quickLogReasonToOperatorMessage("some_unknown_reason_code");

describe("quickLogReasonToOperatorMessage — canonical sensor bands", () => {
  it("temperature_out_of_range states the -10..60 °C band", () => {
    const msg = quickLogReasonToOperatorMessage("temperature_out_of_range");
    expect(msg).not.toBe(GENERIC);
    expect(msg).toMatch(/temperature/i);
    expect(msg).toMatch(/-10/);
    expect(msg).toMatch(/60/);
    expect(msg).toMatch(/°?C/);
  });

  it("humidity_out_of_range states the 0..100 band", () => {
    const msg = quickLogReasonToOperatorMessage("humidity_out_of_range");
    expect(msg).not.toBe(GENERIC);
    expect(msg).toMatch(/humidity/i);
    expect(msg).toMatch(/0/);
    expect(msg).toMatch(/100/);
  });

  it("vpd_out_of_range states the 0..10 kPa band (the hard persistence gate)", () => {
    const msg = quickLogReasonToOperatorMessage("vpd_out_of_range");
    expect(msg).not.toBe(GENERIC);
    expect(msg).toMatch(/vpd/i);
    expect(msg).toMatch(/0/);
    expect(msg).toMatch(/10/);
    expect(msg).toMatch(/kpa/i);
  });

  it("never echoes the raw reason code back to the operator", () => {
    for (const code of [
      "temperature_out_of_range",
      "humidity_out_of_range",
      "vpd_out_of_range",
    ]) {
      expect(quickLogReasonToOperatorMessage(code)).not.toContain(code);
    }
  });
});
