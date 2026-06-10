/**
 * CSV Mapping Templates — pure helpers for the representative CSV preview.
 *
 * Templates only PRE-FILL a suggested {@link RepresentativeColumnMapping}
 * based on common header conventions. The user is always free to adjust
 * headers and units afterward. Templates never label data as live and never
 * write anything.
 *
 * Hard constraints (enforced by tests):
 *  - Pure, deterministic, no I/O, no React, no Supabase.
 *  - No DB writes, no functions.invoke, no service_role.
 *  - When two CSV headers both match the same canonical field, leave the
 *    field unmapped and mark it ambiguous. Templates must never silently
 *    pick one of multiple matching headers.
 *  - Download payload never includes parsed row values, user IDs, internal
 *    IDs, secrets, or tokens.
 */

import {
  emptyRepresentativeMapping,
  type EcUnit,
  type RepresentativeColumnMapping,
  type RepresentativeMappingField,
  type TempUnit,
} from "@/lib/representativeCsvSensorPreviewRules";

export const CSV_MAPPING_PRESET_SCHEMA_VERSION = 1 as const;
export const CSV_MAPPING_PRESET_SOURCE = "representative_csv" as const;

export type CsvMappingTemplateId =
  | "generic_env"
  | "ac_infinity"
  | "generic_sensor_logger"
  | "aroya_representative"
  | "thp_export"
  | "blank_reset";

interface TemplateSynonyms {
  /** lowercase, whitespace-collapsed header strings to match exactly. */
  readonly synonyms: ReadonlyArray<string>;
  readonly unit?: TempUnit | EcUnit;
}

export interface CsvMappingTemplate {
  /** Canonical fields that MUST resolve to a header in the source CSV. */
  readonly requiredFields?: ReadonlyArray<RepresentativeMappingField>;
  /** When true, applying this template clears the mapping and skips matching. */
  readonly isReset?: boolean;
  readonly id: CsvMappingTemplateId;
  readonly name: string;
  readonly description: string;
  /** Per canonical field: list of accepted header strings. */
  readonly fields: Partial<Record<RepresentativeMappingField, TemplateSynonyms>>;
  /**
   * Optional exact header signature for auto-detection. When every header
   * in `allOf` (normalized) is present in the CSV, detection returns this
   * template with high confidence. Order independent. Extra CSV headers
   * are ignored.
   */
  readonly signature?: { readonly allOf: ReadonlyArray<string> };
}

export const CSV_MAPPING_TEMPLATES: ReadonlyArray<CsvMappingTemplate> = [
  {
    id: "generic_env",
    name: "Generic environment CSV",
    description:
      "Common timestamp + temperature + humidity + CO₂ headers used by simple loggers.",
    fields: {
      timestamp: { synonyms: ["timestamp", "date", "time", "datetime"] },
      air_temp: {
        synonyms: ["temperature", "temp", "temp_c", "temp_f", "air_temp"],
        unit: "C",
      },
      humidity: { synonyms: ["humidity", "rh", "humidity_pct"] },
      co2: { synonyms: ["co2", "co2_ppm"] },
    },
  },
  {
    id: "ac_infinity",
    name: "AC Infinity-style",
    description:
      "Time/date with temperature, humidity, and optional VPD / CO₂ columns.",
    fields: {
      timestamp: { synonyms: ["time", "date", "timestamp"] },
      air_temp: { synonyms: ["temperature"], unit: "C" },
      humidity: { synonyms: ["humidity"] },
      vpd: { synonyms: ["vpd"] },
      co2: { synonyms: ["co2"] },
    },
  },
  {
    id: "generic_sensor_logger",
    name: "Generic sensor logger",
    description:
      "Captured-at plus typical canopy + substrate fields including PPFD, EC, pH, and soil moisture.",
    fields: {
      timestamp: { synonyms: ["captured_at", "captured", "timestamp"] },
      air_temp: { synonyms: ["air_temp", "air_temperature"], unit: "C" },
      humidity: { synonyms: ["rh", "humidity"] },
      vpd: { synonyms: ["vpd"] },
      ppfd: { synonyms: ["ppfd", "par"] },
      substrate_ec: { synonyms: ["ec", "substrate_ec"], unit: "mS/cm" },
      vwc: { synonyms: ["soil_moisture", "vwc", "wc"] },
    },
  },
  {
    id: "aroya_representative",
    name: "AROYA-shaped (representative guess)",
    description:
      "Representative shape inspired by AROYA-style exports. Not a confirmed AROYA importer — review every column.",
    requiredFields: ["timestamp"],
    fields: {
      timestamp: {
        synonyms: ["timestamp", "captured_at", "date time", "date_time", "time"],
      },
      air_temp: {
        synonyms: ["air_temp", "room_temp", "climate_temp"],
        unit: "C",
      },
      humidity: { synonyms: ["humidity", "rh", "room_rh"] },
      vpd: { synonyms: ["vpd", "room_vpd"] },
      substrate_ec: {
        synonyms: ["substrate_ec", "rootzone_ec", "ec"],
        unit: "mS/cm",
      },
      vwc: { synonyms: ["vwc", "water_content", "substrate_vwc"] },
      substrate_temp: {
        synonyms: ["substrate_temp", "rootzone_temp"],
        unit: "C",
      },
    },
  },
  {
    id: "thp_export",
    name: "THP sensor export",
    description:
      "Tuya/THP-style export with deviceSerialnum, temperature(°C/°F), humidity, vpd, and optional ppfd.",
    requiredFields: ["timestamp", "air_temp", "humidity"],
    signature: {
      allOf: ["timestamp", "temperature(°c)", "humidity", "vpd"],
    },
    fields: {
      timestamp: { synonyms: ["timestamp"] },
      air_temp: {
        synonyms: ["temperature(°c)", "temperature (°c)", "temperature_c"],
        unit: "C",
      },
      humidity: { synonyms: ["humidity"] },
      vpd: { synonyms: ["vpd"] },
      ppfd: { synonyms: ["ppfd"] },
    },
  },
  {
    id: "blank_reset",
    name: "Blank (clear mapping)",
    description:
      "Clears all selected headers without changing source labeling. Useful to start over.",
    isReset: true,
    fields: {},
  },
];

export function getCsvMappingTemplate(
  id: CsvMappingTemplateId,
): CsvMappingTemplate | null {
  return CSV_MAPPING_TEMPLATES.find((t) => t.id === id) ?? null;
}

function normalizeHeader(raw: string): string {
  return String(raw ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

export interface ApplyTemplateResult {
  mapping: RepresentativeColumnMapping;
  /** Fields left unmapped because >1 CSV header matched the template. */
  ambiguousFields: RepresentativeMappingField[];
  /** Fields listed in the template that found no header at all. */
  unmatchedFields: RepresentativeMappingField[];
  /** Required template fields whose headers were not found in the CSV. */
  missingRequiredHeaders: RepresentativeMappingField[];
  /** When true, the template did not apply because required headers were missing. */
  blocked: boolean;
  /** Human-readable block reason when blocked is true. */
  blockReason: string | null;
}

/**
 * Apply a template against the provided CSV headers. Returns a fresh
 * mapping plus the fields the user still needs to review. Never mutates
 * inputs. If two headers match the same canonical field, the field is
 * left unmapped (ambiguous) — templates must never silently choose.
 *
 * When the template lists `requiredFields` and any required header is
 * missing from the CSV, the result is `blocked: true` with the original
 * (empty) mapping returned. The UI must surface `blockReason` and skip
 * applying it.
 *
 * Reset templates (`isReset: true`) return the empty mapping without
 * matching, and never block.
 */
export function applyCsvMappingTemplate(
  template: CsvMappingTemplate,
  headers: ReadonlyArray<string>,
): ApplyTemplateResult {
  if (template.isReset) {
    return {
      mapping: emptyRepresentativeMapping(),
      ambiguousFields: [],
      unmatchedFields: [],
      missingRequiredHeaders: [],
      blocked: false,
      blockReason: null,
    };
  }

  const mapping = emptyRepresentativeMapping();
  const ambiguous: RepresentativeMappingField[] = [];
  const unmatched: RepresentativeMappingField[] = [];
  const normalized = headers.map(normalizeHeader);

  for (const [fieldRaw, spec] of Object.entries(template.fields)) {
    const field = fieldRaw as RepresentativeMappingField;
    if (!spec) continue;
    const matchedHeaders: string[] = [];
    for (let i = 0; i < normalized.length; i++) {
      if (spec.synonyms.includes(normalized[i])) {
        if (!matchedHeaders.includes(headers[i])) matchedHeaders.push(headers[i]);
      }
    }
    if (matchedHeaders.length === 0) {
      unmatched.push(field);
      continue;
    }
    if (matchedHeaders.length > 1) {
      ambiguous.push(field);
      continue;
    }
    const header = matchedHeaders[0];
    const current = mapping[field];
    if (current === null || typeof current === "string") {
      (mapping as unknown as Record<string, unknown>)[field] = header;
    } else if ("unit" in current) {
      const unit = (spec.unit ?? current.unit) as TempUnit & EcUnit;
      (mapping as unknown as Record<string, unknown>)[field] = { ...current, column: header, unit };
    } else {
      (mapping as unknown as Record<string, unknown>)[field] = { column: header };
    }
  }

  const required = template.requiredFields ?? [];
  const missingRequiredHeaders = required.filter((f) => unmatched.includes(f));
  if (missingRequiredHeaders.length > 0) {
    return {
      mapping: emptyRepresentativeMapping(),
      ambiguousFields: [],
      unmatchedFields: unmatched,
      missingRequiredHeaders,
      blocked: true,
      blockReason: `This template does not match this file. Missing headers: ${missingRequiredHeaders.join(", ")}`,
    };
  }

  return {
    mapping,
    ambiguousFields: ambiguous,
    unmatchedFields: unmatched,
    missingRequiredHeaders: [],
    blocked: false,
    blockReason: null,
  };
}

// ---------- Mapping JSON download payload ----------

export interface CsvMappingDownloadPayload {
  schema_version: typeof CSV_MAPPING_PRESET_SCHEMA_VERSION;
  source: typeof CSV_MAPPING_PRESET_SOURCE;
  template_id: CsvMappingTemplateId | null;
  template_name: string | null;
  created_at: string;
  mapping: Record<RepresentativeMappingField, string | null>;
  units: { air_temp: TempUnit; substrate_temp: TempUnit; substrate_ec: EcUnit };
  unmapped_fields: RepresentativeMappingField[];
  ignored_headers: string[];
}

export interface BuildDownloadPayloadArgs {
  mapping: RepresentativeColumnMapping;
  headers: ReadonlyArray<string>;
  templateId?: CsvMappingTemplateId | null;
  templateName?: string | null;
  now?: () => Date;
}

function mappingHeaderFor(value: RepresentativeColumnMapping[keyof RepresentativeColumnMapping]): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value;
  return value.column;
}

/**
 * Build a client-side downloadable JSON payload that describes the mapping.
 * Does NOT include parsed row values, user/internal IDs, secrets, or tokens.
 */
export function buildMappingDownloadPayload(
  args: BuildDownloadPayloadArgs,
): CsvMappingDownloadPayload {
  const { mapping, headers, templateId = null, templateName = null, now } = args;
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
  const mappingOut = {} as Record<RepresentativeMappingField, string | null>;
  const used = new Set<string>();
  const unmapped: RepresentativeMappingField[] = [];
  for (const f of fields) {
    const header = mappingHeaderFor(mapping[f]);
    mappingOut[f] = header;
    if (header) used.add(header);
    else unmapped.push(f);
  }
  const ignored = headers.filter((h) => !used.has(h));
  const created_at = (now ? now() : new Date()).toISOString();
  return {
    schema_version: CSV_MAPPING_PRESET_SCHEMA_VERSION,
    source: CSV_MAPPING_PRESET_SOURCE,
    template_id: templateId,
    template_name: templateName,
    created_at,
    mapping: mappingOut,
    units: {
      air_temp: mapping.air_temp.unit,
      substrate_temp: mapping.substrate_temp.unit,
      substrate_ec: mapping.substrate_ec.unit,
    },
    unmapped_fields: unmapped,
    ignored_headers: ignored,
  };
}

export function csvMappingDownloadFileName(): string {
  return "verdant-csv-mapping-preset.json";
}

// ---------- Auto-detection ----------

export interface CsvTemplateDetection {
  templateId: CsvMappingTemplateId;
  templateName: string;
  confidence: "high" | "medium";
  matchedFieldCount: number;
}

/**
 * Detect the most likely mapping template for a CSV based on its headers.
 *
 * Deterministic, pure, no I/O. Used to auto-select a starting template
 * after the grower picks a file. The grower may still override the
 * template choice. Detection never labels data as live and never writes.
 *
 * Selection rules:
 *  - A template's `signature.allOf` headers, if present and all matched,
 *    wins immediately with `confidence: "high"`. First match in template
 *    list order wins ties.
 *  - Otherwise, a template qualifies when every `requiredFields` entry
 *    has at least one matching synonym in the CSV. The qualifying
 *    template with the highest number of matched canonical fields wins
 *    with `confidence: "medium"`. Reset templates are ignored. Returns
 *    `null` when nothing qualifies.
 */
export function detectCsvMappingTemplate(
  headers: ReadonlyArray<string>,
): CsvTemplateDetection | null {
  const normalized = new Set(headers.map(normalizeHeader));
  let best: CsvTemplateDetection | null = null;
  for (const tpl of CSV_MAPPING_TEMPLATES) {
    if (tpl.isReset) continue;

    if (tpl.signature && tpl.signature.allOf.length > 0) {
      const allPresent = tpl.signature.allOf.every((h) =>
        normalized.has(normalizeHeader(h)),
      );
      if (allPresent) {
        return {
          templateId: tpl.id,
          templateName: tpl.name,
          confidence: "high",
          matchedFieldCount: tpl.signature.allOf.length,
        };
      }
    }

    const fieldEntries = Object.entries(tpl.fields) as Array<
      [RepresentativeMappingField, TemplateSynonyms | undefined]
    >;
    const fieldMatches = (field: RepresentativeMappingField): boolean => {
      const spec = tpl.fields[field];
      if (!spec) return false;
      return spec.synonyms.some((s) => normalized.has(s));
    };

    const required = tpl.requiredFields ?? [];
    if (required.length === 0) continue; // skip generic catch-alls in auto-detect
    if (!required.every(fieldMatches)) continue;

    let matched = 0;
    for (const [field, spec] of fieldEntries) {
      if (!spec) continue;
      if (fieldMatches(field)) matched++;
    }
    if (matched < required.length) continue;

    if (!best || matched > best.matchedFieldCount) {
      best = {
        templateId: tpl.id,
        templateName: tpl.name,
        confidence: "medium",
        matchedFieldCount: matched,
      };
    }
  }
  return best;
}
