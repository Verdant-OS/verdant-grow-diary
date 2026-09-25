/**
 * QA 2026-09-24, BUG-007: the plant-page Quick Log saved handheld
 * pH 15 / EC 1200 mS/cm / runoff pH -3 / runoff EC "1,8" as note text, and
 * Timeline rendered them as "Manual readings" with no invalid flag.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendHardwareReadingsToNote,
  isHardwareReadingValueValid,
  validateHardwareReadings,
} from "@/lib/quickLogHardwareReadingsRules";

describe("validateHardwareReadings", () => {
  it.each([
    [{ inputPh: "15" }, "Feed/Input pH must be between 0 and 14."],
    [{ inputEc: "1200" }, "Feed/Input EC must be between 0 and 10 mS/cm."],
    [{ runoffPh: "-3" }, "Runoff pH must be between 0 and 14."],
    [{ runoffEc: "1,8" }, "Runoff EC: use a period for decimals (for example 1.8)."],
    [{ inputPh: "six" }, "Feed/Input pH must be a number."],
    [{ ppfdCanopy: "-5" }, "PPFD canopy must be between 0 and 3000 µmol/m²/s."],
    [{ lightDistance: "18 miles" }, "Light distance must be a number."],
  ])("rejects %j", (readings, message) => {
    expect(validateHardwareReadings(readings)).toEqual({ ok: false, message });
  });

  it("accepts realistic readings, blanks, and light distance with a unit", () => {
    expect(
      validateHardwareReadings({
        inputPh: "6.2",
        inputEc: "1.8",
        runoffPh: "6.0",
        runoffEc: "2.1",
        ppfdCanopy: "650",
        lightDistance: "18 in",
      }),
    ).toEqual({ ok: true });
    expect(validateHardwareReadings({ inputPh: "  " })).toEqual({ ok: true });
    expect(validateHardwareReadings(null)).toEqual({ ok: true });
    expect(validateHardwareReadings({ lightDistance: "45cm" })).toEqual({ ok: true });
  });

  it("accepts a leading-decimal reading, which JavaScript reads as 0.8", () => {
    expect(
      validateHardwareReadings({
        inputEc: ".8",
        runoffEc: ".95",
        inputPh: ".5",
        lightDistance: ".5 ft",
      }),
    ).toEqual({ ok: true });
    expect(isHardwareReadingValueValid("inputEc", ".8")).toBe(true);
    // Still bounded, and a leading comma still gets the period guidance.
    expect(validateHardwareReadings({ inputEc: "-.8" })).toEqual({
      ok: false,
      message: "Feed/Input EC must be between 0 and 10 mS/cm.",
    });
    expect(validateHardwareReadings({ runoffEc: ",8" })).toEqual({
      ok: false,
      message: "Runoff EC: use a period for decimals (for example .8).",
    });
    expect(validateHardwareReadings({ inputPh: "." })).toEqual({
      ok: false,
      message: "Feed/Input pH must be a number.",
    });
  });

  it("flags already-saved impossible values for display", () => {
    expect(isHardwareReadingValueValid("inputPh", "15")).toBe(false);
    expect(isHardwareReadingValueValid("runoffPh", "-3")).toBe(false);
    expect(isHardwareReadingValueValid("inputEc", "1200")).toBe(false);
    expect(isHardwareReadingValueValid("runoffEc", "1,8")).toBe(false);
    expect(isHardwareReadingValueValid("inputPh", "6.2")).toBe(true);
  });

  it("does not change how valid readings are written into the note", () => {
    expect(appendHardwareReadingsToNote("Fed", { inputPh: "6.2" })).toBe(
      "Fed\n\nHardware readings (manual handheld):\n- Feed/Input pH: 6.2",
    );
  });
});

describe("wiring", () => {
  // @source-scan-justified: the legacy QuickLog and history panels need the
  // full auth/grow/diary harness to render; these assert the call order and
  // the display flag exist.
  it("QuickLog validates handheld readings before building the note", () => {
    const src = readFileSync(resolve(process.cwd(), "src/components/QuickLog.tsx"), "utf8");
    const validateAt = src.indexOf("validateHardwareReadings(hardware)");
    const appendAt = src.indexOf("appendHardwareReadingsToNote(note, hardware)");
    expect(validateAt).toBeGreaterThan(0);
    expect(appendAt).toBeGreaterThan(validateAt);
  });

  it("Timeline manual-reading chips flag values outside the valid range", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/components/QuickLogHistoryPanels.tsx"),
      "utf8",
    );
    // The flag itself is computed (and rendered) in
    // quicklog-manual-ec-unit-label.test.tsx; this pins the chip wiring.
    expect(src).toMatch(/buildManualReadingChips\(row\.manualHandheld\)/);
    expect(src).toMatch(/outside valid range, not used/);
  });
});
