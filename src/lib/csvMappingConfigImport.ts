/**
 * CSV Mapping Config Import — pure, preview-only validator.
 *
 * Accepts an untrusted JSON string (or already-parsed value) that was
 * exported by Verdant's CSV preview (`buildCsvMappingConfig`) and produces
 * either:
 *   - a `blocked` result with a human-readable reason, leaving the caller's
 *     current mapping untouched, OR
 *   - an `applied` result with a validated `RepresentativeColumnMapping`
 *     plus the list of saved headers that no longer exist in the current
 *     CSV (so the UI can warn the user without guessing replacements) and
 *     the list of sensitive/unknown keys that were stripped.
 *
 * Hard constraints (enforced by tests + static scans):
 *  - Pure: no I/O, no React, no Supabase, no DOM, no timers.
 *  - No DB writes: no insert/upsert/update/delete/rpc/functions.invoke.
 *  - No service_role, no action_queue, no alerts, no ai_doctor_sessions.
 *  - Imported `source_label` is NEVER trusted as proof of live data.
 *  - Never imports parsed row values, raw CSV row data, user/grow/plant IDs,
 *    Supabase IDs, tokens, secrets, or other sensitive fields.
 *  - Conservative: missing headers leave that field unmapped (no guessing).
 *  - Caller's existing mapping is preserved on any blocked import.
 */

import {
  CSV_MAPPING_CONFIG_DATA_CONTEXT,
  CSV_MAPPING_CONFIG_SCHEMA_VERSION,
} from "@/lib/csvMappingConfig";
import {
  REPRESENTATIVE_MAPPING_FIELDS,
  emptyRepresentativeMapping,
  type EcUnit,
  type RepresentativeColumnMapping,
  type RepresentativeMappingField,
  type TempUnit,
} from "@/lib/representativeCsvSensorPreviewRules";

export const CSV_MAPPING_CONFIG_SUPPORTED_VERSIONS: ReadonlyArray<number> = [
  CSV_MAPPING_CONFIG_SCHEMA_VERSION,
];

export type CsvMappingImportBlockCode =
  | "malformed_json"
  | "not_an_object"
  | "wrong_data_context"
  | "unsupported_schema_version"
  | "missing_mapping_object"
  | "missing_units_object"
  | "invalid_unit_value";

export interface CsvMappingImportBlocked {
  status: "blocked";
  code: CsvMappingImportBlockCode;
  message: string;
}

export interface CsvMappingImportMissingHeader {
  field: RepresentativeMappingField;
  header: string;
}

export interface CsvMappingImportApplied {
  status: "applied";
  mapping: RepresentativeColumnMapping;
  /** Saved headers that no longer exist in the current CSV. */
  missingHeaders: CsvMappingImportMissingHeader[];
  /** Canonical fields the imported config left unmapped. */
  unmappedFields: RepresentativeMappingField[];
  /**
   * Top-level keys that were stripped because they are sensitive or
   * unexpected. Useful for telemetry-free UI disclosure.
   */
  ignoredKeys: string[];
}

export type CsvMappingImportResult =
  | CsvMappingImportBlocked
  | CsvMappingImportApplied;

/** Top-level keys that the import will accept. Everything else is ignored. */
const ALLOWED_TOP_LEVEL_KEYS = new Set<string>([
  "schema_version",
  "data_context",
  "source_label",
  "template_id",
  "template_name",
  "created_at",
  "mapping",
  "units",
  "ignored_headers",
  "unmapped_fields",
  "warnings",
]);

const VALID_TEMP_UNITS = new Set<string>(["C", "F"]);
const VALID_EC_UNITS = new Set<string>(["mS/cm", "uS/cm"]);

function block(code: CsvMappingImportBlockCode, message: string): CsvMappingImportBlocked {
  return { status: "blocked", code, message };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export interface ImportCsvMappingConfigArgs {
  /** Raw JSON string or already-parsed value (still treated as untrusted). */
  input: string | unknown;
  /** Headers present in the currently loaded CSV. */
  headers: ReadonlyArray<string>;
}

/**
 * Validate and apply an untrusted mapping-config JSON payload.
 *
 * Returns a discriminated result. Callers must treat `blocked` as a no-op
 * and keep their existing mapping. On `applied`, callers should swap in
 * `result.mapping` and surface `missingHeaders` / `ignoredKeys` in the UI.
 */
export function importCsvMappingConfig(
  args: ImportCsvMappingConfigArgs,
): CsvMappingImportResult {
  const { input, headers } = args;

  let parsed: unknown;
  if (typeof input === "string") {
    try {
      parsed = JSON.parse(input);
    } catch {
      return block("malformed_json", "This file is not valid JSON.");
    }
  } else {
    parsed = input;
  }

  if (!isPlainObject(parsed)) {
    return block("not_an_object", "Mapping preset must be a JSON object.");
  }

  if (parsed.data_context !== CSV_MAPPING_CONFIG_DATA_CONTEXT) {
    return block(
      "wrong_data_context",
      "This file is not a Verdant CSV mapping preset.",
    );
  }

  const versionRaw = parsed.schema_version;
  const version = typeof versionRaw === "number" ? versionRaw : NaN;
  if (!CSV_MAPPING_CONFIG_SUPPORTED_VERSIONS.includes(version)) {
    return block(
      "unsupported_schema_version",
      "This mapping preset version is not supported.",
    );
  }

  const mappingRaw = parsed.mapping;
  if (!isPlainObject(mappingRaw)) {
    return block(
      "missing_mapping_object",
      "Mapping preset is missing the mapping object.",
    );
  }

  const unitsRaw = parsed.units;
  if (!isPlainObject(unitsRaw)) {
    return block(
      "missing_units_object",
      "Mapping preset is missing the units object.",
    );
  }

  const airUnit = unitsRaw.air_temp;
  const subUnit = unitsRaw.substrate_temp;
  const ecUnit = unitsRaw.substrate_ec;
  if (
    !VALID_TEMP_UNITS.has(String(airUnit)) ||
    !VALID_TEMP_UNITS.has(String(subUnit)) ||
    !VALID_EC_UNITS.has(String(ecUnit))
  ) {
    return block(
      "invalid_unit_value",
      "Mapping preset has an unsupported unit value.",
    );
  }

  // From here on, the config is structurally valid. Build a fresh mapping
  // from scratch (never trust caller-provided source_label, IDs, etc.).
  const mapping = emptyRepresentativeMapping();
  mapping.air_temp.unit = airUnit as TempUnit;
  mapping.substrate_temp.unit = subUnit as TempUnit;
  mapping.substrate_ec.unit = ecUnit as EcUnit;

  const headerSet = new Set(headers.map((h) => h.toLowerCase().trim()));
  const missing: CsvMappingImportMissingHeader[] = [];
  const unmapped: RepresentativeMappingField[] = [];

  for (const f of REPRESENTATIVE_MAPPING_FIELDS) {
    const savedHeaderRaw = (mappingRaw as Record<string, unknown>)[f];
    const savedHeader =
      typeof savedHeaderRaw === "string" && savedHeaderRaw.length > 0
        ? savedHeaderRaw
        : null;

    if (savedHeader === null) {
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
      (mapping as unknown as Record<string, unknown>)[f] = {
        column: savedHeader,
        unit: current.unit,
      };
    } else {
      (mapping as unknown as Record<string, unknown>)[f] = { column: savedHeader };
    }
  }

  const ignoredKeys = Object.keys(parsed).filter(
    (k) => !ALLOWED_TOP_LEVEL_KEYS.has(k),
  );

  return {
    status: "applied",
    mapping,
    missingHeaders: missing,
    unmappedFields: unmapped,
    ignoredKeys,
  };
}
