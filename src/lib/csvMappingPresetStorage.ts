/**
 * CSV Mapping Preset Storage — browser-local persistence ONLY.
 *
 * Saves the current representative-CSV mapping to localStorage so the user
 * can quickly re-apply it next session. No Supabase, no account-level
 * persistence, no IDs, no secrets, no telemetry.
 *
 * Hard constraints (tests enforced):
 *  - Touches ONLY localStorage. No fetch, no Supabase, no functions.invoke.
 *  - Apply step is conservative: matching headers are restored, missing
 *    headers produce warnings and remain unmapped. No fuzzy guessing.
 */

import {
  emptyRepresentativeMapping,
  type EcUnit,
  type RepresentativeColumnMapping,
  type RepresentativeMappingField,
  type TempUnit,
} from "@/lib/representativeCsvSensorPreviewRules";
import type { CsvMappingTemplateId } from "@/lib/csvMappingTemplates";

export const CSV_MAPPING_PRESET_STORAGE_KEY =
  "verdant.csvPreview.mappingPreset.v1";

export interface CsvMappingPreset {
  schema_version: 1;
  template_id: CsvMappingTemplateId | null;
  template_name: string | null;
  mapping: Record<RepresentativeMappingField, string | null>;
  units: { air_temp: TempUnit; substrate_temp: TempUnit; substrate_ec: EcUnit };
  saved_at: string;
}

function mappingHeaderFor(value: RepresentativeColumnMapping[keyof RepresentativeColumnMapping]): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value;
  return value.column;
}

function getStorage(): Storage | null {
  try {
    if (typeof globalThis === "undefined") return null;
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

export interface BuildPresetArgs {
  mapping: RepresentativeColumnMapping;
  templateId?: CsvMappingTemplateId | null;
  templateName?: string | null;
  now?: () => Date;
}

export function buildCsvMappingPreset(args: BuildPresetArgs): CsvMappingPreset {
  const { mapping, templateId = null, templateName = null, now } = args;
  const fields: RepresentativeMappingField[] = [
    "timestamp",
    "sensor",
    "facility",
    "room",
    "zone",
    "air_temp",
    "substrate_temp",
    "humidity",
    "vpd",
    "co2",
    "ppfd",
    "vwc",
    "substrate_ec",
  ];
  const out = {} as Record<RepresentativeMappingField, string | null>;
  for (const f of fields) out[f] = mappingHeaderFor(mapping[f]);
  return {
    schema_version: 1,
    template_id: templateId,
    template_name: templateName,
    mapping: out,
    units: {
      air_temp: mapping.air_temp.unit,
      substrate_temp: mapping.substrate_temp.unit,
      substrate_ec: mapping.substrate_ec.unit,
    },
    saved_at: (now ? now() : new Date()).toISOString(),
  };
}

export function saveCsvMappingPreset(preset: CsvMappingPreset): boolean {
  const ls = getStorage();
  if (!ls) return false;
  try {
    ls.setItem(CSV_MAPPING_PRESET_STORAGE_KEY, JSON.stringify(preset));
    return true;
  } catch {
    return false;
  }
}

export function loadCsvMappingPreset(): CsvMappingPreset | null {
  const ls = getStorage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(CSV_MAPPING_PRESET_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CsvMappingPreset;
    if (!parsed || typeof parsed !== "object" || parsed.schema_version !== 1) {
      return null;
    }
    return parsed;
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

export interface ApplyPresetResult {
  mapping: RepresentativeColumnMapping;
  /** Fields whose saved header is no longer present in the current CSV. */
  missingHeaders: Array<{ field: RepresentativeMappingField; header: string }>;
  /** Fields that were saved as unmapped (nothing to restore). */
  unmappedFields: RepresentativeMappingField[];
}

/**
 * Conservative apply: only restore headers that still exist in the current
 * CSV. Missing/renamed headers are flagged so the UI can warn the user.
 * Never guesses replacements.
 */
export function applyCsvMappingPreset(
  preset: CsvMappingPreset,
  headers: ReadonlyArray<string>,
): ApplyPresetResult {
  const mapping = emptyRepresentativeMapping();
  const missing: ApplyPresetResult["missingHeaders"] = [];
  const unmapped: RepresentativeMappingField[] = [];
  const headerSet = new Set(headers.map((h) => h.toLowerCase().trim()));

  const fields = Object.keys(preset.mapping) as RepresentativeMappingField[];
  for (const f of fields) {
    const savedHeader = preset.mapping[f];
    if (!savedHeader) {
      unmapped.push(f);
      continue;
    }
    if (!headerSet.has(savedHeader.toLowerCase().trim())) {
      missing.push({ field: f, header: savedHeader });
      continue;
    }
    const current = mapping[f];
    if (current === null || typeof current === "string") {
      (mapping as unknown as Record<string, unknown>)[f] = savedHeader;
    } else if ("unit" in current) {
      let unit: TempUnit | EcUnit = current.unit;
      if (f === "air_temp") unit = preset.units.air_temp;
      else if (f === "substrate_temp") unit = preset.units.substrate_temp;
      else if (f === "substrate_ec") unit = preset.units.substrate_ec;
      (mapping as unknown as Record<string, unknown>)[f] = { column: savedHeader, unit };
    } else {
      (mapping as unknown as Record<string, unknown>)[f] = { column: savedHeader };
    }
  }

  // Restore units even when the field could not be matched, so the UI shows
  // the user's last unit choice on the corresponding selector.
  mapping.air_temp.unit = preset.units.air_temp;
  mapping.substrate_temp.unit = preset.units.substrate_temp;
  mapping.substrate_ec.unit = preset.units.substrate_ec;

  return { mapping, missingHeaders: missing, unmappedFields: unmapped };
}
