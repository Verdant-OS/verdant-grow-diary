/**
 * Grower bug report 2026-11-03, item 14 — spec
 * docs/specs/quick-log-structured-sensor-readings.md §3 step 3.
 */
import { describe, expect, it } from "vitest";
import { buildStructuredReadings } from "@/lib/quickLogStructuredReadingRules";
import { TRUTH_REASON_CHIP } from "@/lib/sensorTruthRules";

describe("buildStructuredReadings", () => {
  it("keeps realistic readings under the canonical metric names, unflagged", () => {
    const r = buildStructuredReadings({
      soilTemp: "21.5",
      soilTempUnit: "C",
      vwcPct: "45",
      soilEcMsCm: "1.4",
      co2Ppm: "800",
      ppfd: "600",
    });
    expect(r.values).toEqual({
      soil_temp_c: 21.5,
      soil_moisture_pct: 45,
      soil_ec_ms_cm: 1.4,
      co2_ppm: 800,
      ppfd: 600,
    });
    expect(r.flags).toEqual([]);
    expect(r.errors).toEqual([]);
  });

  it("converts °F soil temp to °C exactly once", () => {
    expect(buildStructuredReadings({ soilTemp: "68", soilTempUnit: "F" }).values).toEqual({
      soil_temp_c: 20,
    });
  });

  it("omits blanks and never writes 0 for an empty field", () => {
    const r = buildStructuredReadings({ soilTemp: "  ", vwcPct: "", co2Ppm: null });
    expect(r.values).toEqual({});
    expect(r.flags).toEqual([]);
  });

  it("keeps implausible values but flags them (never healthy)", () => {
    const r = buildStructuredReadings({ vwcPct: "150", co2Ppm: "99999", ppfd: "-5" });
    expect(r.values).toEqual({ soil_moisture_pct: 150, co2_ppm: 99999, ppfd: -5 });
    expect(r.flags.map((f) => f.key).sort()).toEqual(["co2_ppm", "ppfd", "soil_moisture_pct"]);
  });

  it("flags a soil EC that looks like µS/cm as a unit mismatch", () => {
    const r = buildStructuredReadings({ soilEcMsCm: "1450" });
    expect(r.values).toEqual({ soil_ec_ms_cm: 1450 });
    expect(r.flags).toEqual([
      { key: "soil_ec_ms_cm", chip: TRUTH_REASON_CHIP.unit_mismatch_suspected },
    ]);
  });

  it("reports text that is not a number and does not store it", () => {
    const r = buildStructuredReadings({ co2Ppm: "high", soilEcMsCm: "1,2" });
    expect(r.errors).toEqual([{ key: "co2_ppm", message: "Enter a number" }]);
    expect(r.values).toEqual({ soil_ec_ms_cm: 1.2 });
  });

  it("is deterministic", () => {
    const input = { soilTemp: "75", soilTempUnit: "F" as const, ppfd: "900" };
    expect(buildStructuredReadings(input)).toEqual(buildStructuredReadings(input));
  });
});
