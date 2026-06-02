/**
 * CSV mapping preset — browser localStorage persistence tests.
 *
 * Verifies localStorage-only persistence, no Supabase, no fetch, and
 * conservative apply behavior with header drift.
 */
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  applyCsvMappingPreset,
  buildCsvMappingPreset,
  clearCsvMappingPreset,
  CSV_MAPPING_PRESET_STORAGE_KEY,
  loadCsvMappingPreset,
  saveCsvMappingPreset,
} from "@/lib/csvMappingPresetStorage";
import { emptyRepresentativeMapping } from "@/lib/representativeCsvSensorPreviewRules";
import { stripSourceComments } from "@/test/utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

function fullMapping() {
  const m = emptyRepresentativeMapping();
  m.timestamp = "Timestamp";
  m.air_temp = { column: "Air_F", unit: "F" };
  m.humidity = { column: "RH" };
  m.substrate_ec = { column: "EC", unit: "uS/cm" };
  return m;
}

describe("csv mapping preset storage — localStorage only", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("save preset writes only to localStorage", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch" as never).mockImplementation((() => {
      throw new Error("fetch must not be called");
    }) as never);
    const preset = buildCsvMappingPreset({ mapping: fullMapping() });
    expect(saveCsvMappingPreset(preset)).toBe(true);
    expect(localStorage.getItem(CSV_MAPPING_PRESET_STORAGE_KEY)).toContain("Timestamp");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("apply saved preset restores mapping and units when headers match", () => {
    const preset = buildCsvMappingPreset({ mapping: fullMapping() });
    saveCsvMappingPreset(preset);
    const loaded = loadCsvMappingPreset();
    expect(loaded).not.toBeNull();
    const applied = applyCsvMappingPreset(loaded!, ["Timestamp", "Air_F", "RH", "EC"]);
    expect(applied.mapping.timestamp).toBe("Timestamp");
    expect(applied.mapping.air_temp.column).toBe("Air_F");
    expect(applied.mapping.air_temp.unit).toBe("F");
    expect(applied.mapping.substrate_ec.column).toBe("EC");
    expect(applied.mapping.substrate_ec.unit).toBe("uS/cm");
    expect(applied.missingHeaders).toEqual([]);
  });

  it("missing saved headers produce clear warnings, never guesses", () => {
    const preset = buildCsvMappingPreset({ mapping: fullMapping() });
    saveCsvMappingPreset(preset);
    const loaded = loadCsvMappingPreset()!;
    // CSV now has different headers — EC renamed.
    const applied = applyCsvMappingPreset(loaded, ["Timestamp", "Air_F", "RH", "EC_NEW"]);
    expect(applied.missingHeaders.some((m) => m.field === "substrate_ec" && m.header === "EC")).toBe(true);
    expect(applied.mapping.substrate_ec.column).toBeNull();
  });

  it("clear preset removes the localStorage entry", () => {
    saveCsvMappingPreset(buildCsvMappingPreset({ mapping: fullMapping() }));
    expect(localStorage.getItem(CSV_MAPPING_PRESET_STORAGE_KEY)).not.toBeNull();
    clearCsvMappingPreset();
    expect(localStorage.getItem(CSV_MAPPING_PRESET_STORAGE_KEY)).toBeNull();
    expect(loadCsvMappingPreset()).toBeNull();
  });

  it("no Supabase writes, no functions.invoke, no service_role, no live labeling in preset module", () => {
    const src = stripSourceComments(read("src/lib/csvMappingPresetStorage.ts"));
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.upsert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/\.rpc\(/);
    expect(src).not.toMatch(/functions\.invoke/);
    expect(src).not.toMatch(/service_role/);
    expect(src).not.toMatch(/\bsupabase\b/);
    expect(src).not.toMatch(/=\s*['"]live['"]/);
  });
});
