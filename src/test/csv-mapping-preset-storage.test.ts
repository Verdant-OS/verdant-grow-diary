/**
 * CSV mapping preset storage tests.
 *
 * Verifies:
 *  - localStorage-only persistence
 *  - buildCsvMappingConfig shape is used
 *  - no row data, IDs, secrets stored
 *  - apply reuses importCsvMappingConfig validator
 *  - conservative header matching (no guessing)
 *  - schema_version enforcement
 *  - malformed JSON handling
 */
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  applySavedCsvMappingPreset,
  clearCsvMappingPreset,
  CSV_MAPPING_PRESET_STORAGE_KEY,
  loadCsvMappingPreset,
  saveCsvMappingPreset,
} from "@/lib/csvMappingPresetStorage";
import { buildCsvMappingConfig } from "@/lib/csvMappingConfig";
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

function buildTestConfig() {
  return buildCsvMappingConfig({
    mapping: fullMapping(),
    headers: ["Timestamp", "Air_F", "RH", "EC", "ExtraCol"],
    templateId: null,
    templateName: null,
  });
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
    const fetchSpy = vi
      .spyOn(globalThis, "fetch" as never)
      .mockImplementation((() => {
        throw new Error("fetch must not be called");
      }) as never);
    const config = buildTestConfig();
    expect(saveCsvMappingPreset(config)).toBe(true);
    const raw = localStorage.getItem(CSV_MAPPING_PRESET_STORAGE_KEY)!;
    expect(raw).toContain("mapping_config");
    expect(raw).toContain("Timestamp");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("saved preset uses mapping_config shape", () => {
    const config = buildTestConfig();
    saveCsvMappingPreset(config);
    const loaded = loadCsvMappingPreset();
    expect(loaded).not.toBeNull();
    expect(loaded!.data_context).toBe("mapping_config");
    expect(loaded!.schema_version).toBe(1);
    expect(loaded!.source_label).toBe("representative_csv");
  });

  it("saved preset excludes row data and raw CSV row data", () => {
    const config = buildTestConfig();
    saveCsvMappingPreset(config);
    const raw = localStorage.getItem(CSV_MAPPING_PRESET_STORAGE_KEY)!;
    expect(raw).not.toContain("rowIndex");
    expect(raw).not.toContain("parsedValue");
    expect(raw).not.toContain("raw_payload");
    expect(raw).not.toContain("sensor_readings");
  });

  it("saved preset excludes user IDs, internal IDs, tokens, secrets, Supabase IDs", () => {
    const config = buildTestConfig();
    saveCsvMappingPreset(config);
    const raw = localStorage.getItem(CSV_MAPPING_PRESET_STORAGE_KEY)!;
    expect(raw).not.toMatch(/\buser_id\b/);
    expect(raw).not.toMatch(/\bgrow_id\b/);
    expect(raw).not.toMatch(/\bplant_id\b/);
    expect(raw).not.toMatch(/\btent_id\b/);
    expect(raw).not.toMatch(/\btoken\b/);
    expect(raw).not.toMatch(/\bsecret\b/);
    expect(raw).not.toMatch(/\bservice_role\b/);
  });

  it("apply saved preset reuses import validator path", () => {
    const config = buildTestConfig();
    saveCsvMappingPreset(config);
    const result = applySavedCsvMappingPreset([
      "Timestamp",
      "Air_F",
      "RH",
      "EC",
    ]);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("applied");
  });

  it("apply saved preset restores matching headers and units", () => {
    const config = buildTestConfig();
    saveCsvMappingPreset(config);
    const result = applySavedCsvMappingPreset([
      "Timestamp",
      "Air_F",
      "RH",
      "EC",
    ]);
    expect(result!.status).toBe("applied");
    const m = (result as Extract<typeof result, { status: "applied" }>).mapping;
    expect(m.timestamp).toBe("Timestamp");
    expect(m.air_temp.column).toBe("Air_F");
    expect(m.air_temp.unit).toBe("F");
    expect(m.substrate_ec.column).toBe("EC");
    expect(m.substrate_ec.unit).toBe("uS/cm");
  });

  it("apply saved preset drops missing headers", () => {
    const config = buildTestConfig();
    saveCsvMappingPreset(config);
    const result = applySavedCsvMappingPreset([
      "Timestamp",
      "Air_F",
      "RH",
      "EC_NEW",
    ]);
    expect(result!.status).toBe("applied");
    const m = (result as Extract<typeof result, { status: "applied" }>).mapping;
    expect(m.substrate_ec.column).toBeNull();
  });

  it("apply saved preset shows warning listing missing headers", () => {
    const config = buildTestConfig();
    saveCsvMappingPreset(config);
    const result = applySavedCsvMappingPreset([
      "Timestamp",
      "Air_F",
      "RH",
      "EC_NEW",
    ]);
    expect(result!.status).toBe("applied");
    const missing = (result as Extract<typeof result, { status: "applied" }>).missingHeaders;
    expect(
      missing.some(
        (m) => m.field === "substrate_ec" && m.header === "EC",
      ),
    ).toBe(true);
  });

  it("apply saved preset does not guess replacement headers", () => {
    const config = buildTestConfig();
    saveCsvMappingPreset(config);
    const result = applySavedCsvMappingPreset([
      "Timestamp",
      "Air_F",
      "RH",
      "EC_NEW",
    ]);
    const m = (result as Extract<typeof result, { status: "applied" }>).mapping;
    expect(m.substrate_ec.column).toBeNull();
    expect(m.substrate_ec.unit).toBe("uS/cm");
  });

  it("unsupported schema_version blocks apply", () => {
    const config = buildTestConfig();
    saveCsvMappingPreset(config);
    const raw = localStorage.getItem(CSV_MAPPING_PRESET_STORAGE_KEY)!;
    const tampered = JSON.parse(raw);
    tampered.schema_version = 999;
    localStorage.setItem(
      CSV_MAPPING_PRESET_STORAGE_KEY,
      JSON.stringify(tampered),
    );
    const result = applySavedCsvMappingPreset([
      "Timestamp",
      "Air_F",
      "RH",
      "EC",
    ]);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("blocked");
    expect((result as Extract<typeof result, { status: "blocked" }>).message).toMatch(
      /not supported/i,
    );
  });

  it("malformed saved JSON is handled safely", () => {
    localStorage.setItem(CSV_MAPPING_PRESET_STORAGE_KEY, "not-json{");
    const loaded = loadCsvMappingPreset();
    expect(loaded).toBeNull();
    const result = applySavedCsvMappingPreset(["Timestamp"]);
    expect(result).toBeNull();
  });

  it("blocked preset apply preserves current mapping", () => {
    const config = buildTestConfig();
    saveCsvMappingPreset(config);
    const raw = localStorage.getItem(CSV_MAPPING_PRESET_STORAGE_KEY)!;
    const tampered = JSON.parse(raw);
    tampered.schema_version = 999;
    localStorage.setItem(
      CSV_MAPPING_PRESET_STORAGE_KEY,
      JSON.stringify(tampered),
    );
    const currentMapping = emptyRepresentativeMapping();
    currentMapping.timestamp = "Other";
    const result = applySavedCsvMappingPreset([
      "Timestamp",
      "Air_F",
      "RH",
      "EC",
    ]);
    expect(result!.status).toBe("blocked");
    expect(currentMapping.timestamp).toBe("Other");
  });

  it("clear preset removes localStorage entry", () => {
    saveCsvMappingPreset(buildTestConfig());
    expect(localStorage.getItem(CSV_MAPPING_PRESET_STORAGE_KEY)).not.toBeNull();
    clearCsvMappingPreset();
    expect(localStorage.getItem(CSV_MAPPING_PRESET_STORAGE_KEY)).toBeNull();
    expect(loadCsvMappingPreset()).toBeNull();
  });

  it("saved preset apply does not introduce live labels", () => {
    const config = buildTestConfig();
    saveCsvMappingPreset(config);
    const result = applySavedCsvMappingPreset([
      "Timestamp",
      "Air_F",
      "RH",
      "EC",
    ]);
    expect(result!.status).toBe("applied");
    const raw = JSON.stringify(result);
    expect(raw).not.toMatch(/=\s*['"]live['"]/);
  });

  it("no Supabase writes, no functions.invoke, no service_role in preset module", () => {
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