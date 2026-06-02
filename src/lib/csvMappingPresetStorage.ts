/**
 * CSV Mapping Preset Storage — browser-local persistence ONLY.
 *
 * Saves the current representative-CSV mapping to localStorage so the user
 * can quickly re-apply it next session. No Supabase, no account-level
 * persistence, no IDs, no secrets, no telemetry.
 *
 * Uses the same shape as buildCsvMappingConfig and the same validator as
 * importCsvMappingConfig so save/apply are symmetric and safe.
 *
 * Hard constraints (tests enforced):
 *  - Touches ONLY localStorage. No fetch, no Supabase, no functions.invoke.
 *  - Apply step reuses importCsvMappingConfig — identical validation path.
 */

import type { CsvMappingConfig } from "@/lib/csvMappingConfig";
import {
  importCsvMappingConfig,
  type CsvMappingImportResult,
} from "@/lib/csvMappingConfigImport";

export const CSV_MAPPING_PRESET_STORAGE_KEY =
  "verdant.csvPreview.mappingPreset.v1";

function getStorage(): Storage | null {
  try {
    if (typeof globalThis === "undefined") return null;
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

export function saveCsvMappingPreset(config: CsvMappingConfig): boolean {
  const ls = getStorage();
  if (!ls) return false;
  try {
    ls.setItem(CSV_MAPPING_PRESET_STORAGE_KEY, JSON.stringify(config));
    return true;
  } catch {
    return false;
  }
}

export function loadCsvMappingPreset(): CsvMappingConfig | null {
  const ls = getStorage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(CSV_MAPPING_PRESET_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const p = parsed as Record<string, unknown>;
    if (
      typeof p.schema_version !== "number" ||
      p.data_context !== "mapping_config"
    ) {
      return null;
    }
    return parsed as CsvMappingConfig;
  } catch {
    return null;
  }
}

export function clearCsvMappingPreset(): boolean {
  const ls = getStorage();
  if (!ls) return false;
  try {
    ls.removeItem(CSV_MAPPING_PRESET_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Apply a saved preset by loading it from localStorage and running it
 * through importCsvMappingConfig — the exact same validator used for
 * uploaded mapping JSON files. This guarantees consistent behavior
 * between downloaded presets and browser-local presets.
 *
 * Returns null when no preset exists in localStorage.
 */
export function applySavedCsvMappingPreset(
  headers: ReadonlyArray<string>,
): CsvMappingImportResult | null {
  const loaded = loadCsvMappingPreset();
  if (!loaded) return null;
  return importCsvMappingConfig({ input: loaded, headers });
}
