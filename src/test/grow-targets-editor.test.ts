/**
 * Tests for the grow_targets schema, hook normalization, editor wiring,
 * and Dashboard Target Comparison integration.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeTargetsRow } from "@/hooks/useGrowTargets";
import {
  FIELDS,
  celsiusToDisplayUnit,
  displayUnitToCelsius,
  rowValueToFormValue,
  rowToForm,
  temperatureUnitSymbol,
} from "@/components/GrowTargetsEditor";

const ROOT = resolve(__dirname, "../..");
const DASHBOARD = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");
const HOOK = readFileSync(resolve(ROOT, "src/hooks/useGrowTargets.ts"), "utf8");
const EDITOR = readFileSync(
  resolve(ROOT, "src/components/GrowTargetsEditor.tsx"),
  "utf8",
);
const TYPES = readFileSync(
  resolve(ROOT, "src/integrations/supabase/types.ts"),
  "utf8",
);

const AI_COACH_CALL = /["'`]ai-coach["'`]|functions\/ai-coach|ai_coach/;
const EXTERNAL_CONTROL =
  /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|\brelay\b|\bactuator\b/i;
const SERVICE_ROLE = /service_role/;

describe("grow_targets schema (generated types)", () => {
  it("exposes a grow_targets table in generated types", () => {
    expect(TYPES).toMatch(/grow_targets:\s*\{/);
  });
  it("contains all min/max columns", () => {
    for (const col of [
      "temp_min",
      "temp_max",
      "rh_min",
      "rh_max",
      "vpd_min",
      "vpd_max",
      "soil_wc_min",
      "soil_wc_max",
      "soil_ec_min",
      "soil_ec_max",
      "soil_temp_min",
      "soil_temp_max",
      "ppfd_min",
      "ppfd_max",
    ]) {
      expect(TYPES).toMatch(new RegExp(`${col}\\??:`));
    }
  });
  it("contains grow_id foreign key to grows", () => {
    expect(TYPES).toMatch(/grow_targets_grow_id_fkey/);
  });
});

describe("normalizeTargetsRow", () => {
  it("returns null for null", () => {
    expect(normalizeTargetsRow(null)).toBeNull();
  });
  it("returns null when all min/max are null", () => {
    expect(
      normalizeTargetsRow({
        temp_min: null,
        temp_max: null,
        rh_min: null,
        rh_max: null,
      }),
    ).toBeNull();
  });
  it("maps DB columns into metric keys", () => {
    const r = normalizeTargetsRow({
      temp_min: 20,
      temp_max: 28,
      rh_min: 40,
      rh_max: 65,
      vpd_min: null,
      vpd_max: 1.5,
      soil_wc_min: 30,
      soil_wc_max: 70,
      soil_ec_min: 1,
      soil_ec_max: 2.5,
      soil_temp_min: 18,
      soil_temp_max: 26,
      ppfd_min: 300,
      ppfd_max: 900,
    });
    expect(r).not.toBeNull();
    expect(r!.temp).toEqual({ min: 20, max: 28 });
    expect(r!.rh).toEqual({ min: 40, max: 65 });
    expect(r!.vpd).toEqual({ min: null, max: 1.5 });
    expect(r!.soil).toEqual({ min: 30, max: 70 });
    expect(r!.soil_ec).toEqual({ min: 1, max: 2.5 });
    expect(r!.soil_temp).toEqual({ min: 18, max: 26 });
    expect(r!.ppfd).toEqual({ min: 300, max: 900 });
  });
  it("ignores non-finite values", () => {
    const r = normalizeTargetsRow({ temp_min: "abc", temp_max: 30 });
    expect(r).toEqual({ temp: { min: null, max: 30 } });
  });
});

describe("useGrowTargets hook contract", () => {
  it("queries grow_targets by grow_id", () => {
    expect(HOOK).toMatch(/\.from\(["']grow_targets["']\)/);
    expect(HOOK).toMatch(/\.eq\(["']grow_id["']/);
    expect(HOOK).toMatch(/maybeSingle/);
  });
  it("exposes a reload function", () => {
    expect(HOOK).toMatch(/reload\s*:\s*load/);
  });
  it("introduces no write paths", () => {
    expect(HOOK).not.toMatch(
      /\.from\([^)]+\)\s*\.(insert|update|delete|upsert)/,
    );
  });
  it("introduces no ai-coach call", () => {
    expect(AI_COACH_CALL.test(HOOK)).toBe(false);
  });
  it("introduces no external-control strings", () => {
    expect(EXTERNAL_CONTROL.test(HOOK)).toBe(false);
  });
  it("introduces no service_role", () => {
    expect(SERVICE_ROLE.test(HOOK)).toBe(false);
  });
});

describe("GrowTargetsEditor contract", () => {
  it("loads existing targets via maybeSingle by grow_id", () => {
    expect(EDITOR).toMatch(/\.from\(["']grow_targets["']\)/);
    expect(EDITOR).toMatch(/\.eq\(["']grow_id["']/);
    expect(EDITOR).toMatch(/maybeSingle/);
  });
  it("saves via upsert on conflict grow_id", () => {
    expect(EDITOR).toMatch(/\.upsert\(/);
    expect(EDITOR).toMatch(/onConflict\s*:\s*["']grow_id["']/);
  });
  it("sets user_id from authenticated user, never trusts client form input", () => {
    expect(EDITOR).toMatch(/user_id\s*:\s*user\.id/);
    expect(EDITOR).not.toMatch(/user_id\s*:\s*form\[/);
  });
  it("does not introduce an ai-coach call", () => {
    expect(AI_COACH_CALL.test(EDITOR)).toBe(false);
  });
  it("does not introduce external-control strings", () => {
    expect(EXTERNAL_CONTROL.test(EDITOR)).toBe(false);
  });
  it("does not introduce service_role", () => {
    expect(SERVICE_ROLE.test(EDITOR)).toBe(false);
  });
  it("does not write to action_queue", () => {
    expect(EDITOR).not.toMatch(/action_queue/);
  });
});

describe("GrowTargetsEditor temperature unit preference", () => {
  // Regression: this dialog previously hardcoded "°C" as both the label and
  // the implicit unit of every number typed in, regardless of the app-wide
  // temperature preference (default: Fahrenheit — see
  // DEFAULT_TEMPERATURE_UNIT in temperatureUnitPreference.ts). A grower on
  // the Fahrenheit default had no indication they needed to type a Celsius
  // number, and the value was stored as if it were already Celsius.

  it("marks exactly temp and soil_temp as temperature fields", () => {
    const tempKeys = FIELDS.filter((f) => f.isTemperature).map((f) => f.key);
    expect(tempKeys.sort()).toEqual(["soil_temp", "temp"]);
  });

  it("does not mark non-temperature fields as temperature fields", () => {
    for (const key of ["rh", "vpd", "soil_wc", "soil_ec", "ppfd"] as const) {
      const field = FIELDS.find((f) => f.key === key)!;
      expect(field.isTemperature).toBeFalsy();
    }
  });

  describe("temperatureUnitSymbol", () => {
    it("returns °F for fahrenheit and °C for celsius", () => {
      expect(temperatureUnitSymbol("fahrenheit")).toBe("°F");
      expect(temperatureUnitSymbol("celsius")).toBe("°C");
    });
  });

  describe("celsiusToDisplayUnit / displayUnitToCelsius", () => {
    it("is a no-op in celsius", () => {
      expect(celsiusToDisplayUnit(21, "celsius")).toBe(21);
      expect(displayUnitToCelsius(21, "celsius")).toBe(21);
    });

    it("converts a known celsius value to fahrenheit correctly", () => {
      // 20°C is exactly 68°F — a clean value with no rounding ambiguity.
      expect(celsiusToDisplayUnit(20, "fahrenheit")).toBe(68);
      expect(displayUnitToCelsius(68, "fahrenheit")).toBe(20);
    });

    it("converts 0°C and negative celsius correctly", () => {
      expect(celsiusToDisplayUnit(0, "fahrenheit")).toBe(32);
      expect(celsiusToDisplayUnit(-10, "fahrenheit")).toBe(14);
    });

    it("round-trips within floating-point noise for arbitrary values", () => {
      // The exact bug class this guards against: reopening the dialog and
      // saving without touching a field must not silently drift the stored
      // Celsius value on every save.
      for (const celsius of [18.5, 21.3, 26.75, -5.2, 30]) {
        const displayed = celsiusToDisplayUnit(celsius, "fahrenheit");
        const roundTripped = displayUnitToCelsius(displayed, "fahrenheit");
        expect(Math.abs(roundTripped - celsius)).toBeLessThan(0.02);
      }
    });

    it("rounds to at most 2 decimal places", () => {
      const displayed = celsiusToDisplayUnit(21.333333, "fahrenheit");
      const decimals = (String(displayed).split(".")[1] ?? "").length;
      expect(decimals).toBeLessThanOrEqual(2);
    });
  });

  describe("rowValueToFormValue", () => {
    const tempField = FIELDS.find((f) => f.key === "temp")!;
    const rhField = FIELDS.find((f) => f.key === "rh")!;

    it("returns empty string for null/undefined", () => {
      expect(rowValueToFormValue(null, tempField, "fahrenheit")).toBe("");
      expect(rowValueToFormValue(undefined, tempField, "fahrenheit")).toBe("");
    });

    it("returns empty string for non-finite values", () => {
      expect(rowValueToFormValue("not-a-number", tempField, "fahrenheit")).toBe("");
    });

    it("converts a temperature field's stored Celsius value to the display unit", () => {
      expect(rowValueToFormValue(20, tempField, "fahrenheit")).toBe("68");
      expect(rowValueToFormValue(20, tempField, "celsius")).toBe("20");
    });

    it("never converts a non-temperature field, even when the preference is fahrenheit", () => {
      expect(rowValueToFormValue(65, rhField, "fahrenheit")).toBe("65");
    });
  });

  describe("rowToForm", () => {
    it("converts every temperature column, leaves every other column untouched", () => {
      const row = {
        temp_min: 20,
        temp_max: 28,
        rh_min: 40,
        rh_max: 65,
        soil_temp_min: 18,
        soil_temp_max: 26,
        ppfd_min: 300,
        ppfd_max: 900,
      };
      const form = rowToForm(row, "fahrenheit");
      expect(form.temp_min).toBe("68");
      expect(form.temp_max).toBe("82.4");
      expect(form.soil_temp_min).toBe("64.4");
      expect(form.soil_temp_max).toBe("78.8");
      // Untouched: same values, whatever the preference.
      expect(form.rh_min).toBe("40");
      expect(form.rh_max).toBe("65");
      expect(form.ppfd_min).toBe("300");
      expect(form.ppfd_max).toBe("900");
    });

    it("in celsius mode, temperature columns pass through unchanged", () => {
      const row = { temp_min: 20, temp_max: 28 };
      const form = rowToForm(row, "celsius");
      expect(form.temp_min).toBe("20");
      expect(form.temp_max).toBe("28");
    });

    it("returns the empty form for a null row", () => {
      const form = rowToForm(null, "fahrenheit");
      expect(form.temp_min).toBe("");
      expect(form.temp_max).toBe("");
    });
  });

  describe("wiring", () => {
    it("reads the live temperature unit preference", () => {
      expect(EDITOR).toMatch(/useTemperatureUnitPreference/);
      expect(EDITOR).toMatch(
        /from ["']@\/hooks\/useTemperatureUnitPreference["']/,
      );
    });

    it("no longer hardcodes °C as the label for every field", () => {
      // The exact regression string: a field's unit rendered unconditionally
      // from a static FieldDef.unit, with no isTemperature branch.
      expect(EDITOR).not.toMatch(/\{f\.label\}\s*\(\{f\.unit\}\)/);
      expect(EDITOR).toMatch(/temperatureUnitSymbol/);
    });

    it("converts the display unit back to Celsius before the upsert", () => {
      const convertIdx = EDITOR.indexOf("displayUnitToCelsius");
      const upsertIdx = EDITOR.indexOf(".upsert(");
      expect(convertIdx).toBeGreaterThan(-1);
      expect(upsertIdx).toBeGreaterThan(-1);
      expect(convertIdx).toBeLessThan(upsertIdx);
    });

    it("does not introduce an ai-coach call, external-control strings, or service_role", () => {
      expect(AI_COACH_CALL.test(EDITOR)).toBe(false);
      expect(EXTERNAL_CONTROL.test(EDITOR)).toBe(false);
      expect(SERVICE_ROLE.test(EDITOR)).toBe(false);
    });
  });
});

describe("Dashboard Target Comparison editor wiring", () => {
  it("imports GrowTargetsEditor", () => {
    expect(DASHBOARD).toMatch(/GrowTargetsEditor/);
  });
  it("renders an Edit targets button", () => {
    expect(DASHBOARD).toMatch(/Edit targets/);
  });
  it("uses targets from the hook (not hardcoded defaults)", () => {
    expect(DASHBOARD).toMatch(/targetsState\.targets/);
    expect(DASHBOARD).not.toMatch(
      /const\s+\w*[Tt]argets\s*=\s*\{\s*temp\s*:\s*\{\s*min\s*:\s*\d/,
    );
  });
  it("reloads targets after save", () => {
    expect(DASHBOARD).toMatch(/targetsState\.reload\(\)/);
  });
});
