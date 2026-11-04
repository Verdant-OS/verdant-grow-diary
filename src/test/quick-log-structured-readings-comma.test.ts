/**
 * Seat A P3 on PR #2820 (23818d3): "1,000" silently became 1. A reading with
 * a thousands-style comma is now rejected instead of guessed.
 */
import { describe, expect, it } from "vitest";
import { buildStructuredReadings } from "@/lib/quickLogStructuredReadingRules";

describe("structured reading comma handling", () => {
  it("rejects a thousands-style comma instead of reading 1,000 as 1", () => {
    const r = buildStructuredReadings({ co2Ppm: "1,000", ppfd: "1,200,000" });
    expect(r.values).toEqual({});
    expect(r.errors).toEqual([
      { key: "co2_ppm", message: "Write 1000 or 1.2, without a thousands comma" },
      { key: "ppfd", message: "Write 1000 or 1.2, without a thousands comma" },
    ]);
  });

  it("still accepts a decimal comma and plain numbers", () => {
    expect(buildStructuredReadings({ soilEcMsCm: "1,2", co2Ppm: "1000" }).values).toEqual({
      soil_ec_ms_cm: 1.2,
      co2_ppm: 1000,
    });
    expect(buildStructuredReadings({ soilEcMsCm: "1,25" }).values).toEqual({ soil_ec_ms_cm: 1.25 });
  });
});
