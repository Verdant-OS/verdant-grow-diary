/**
 * CSV Mapping Config — pure serializer for the representative CSV preview.
 *
 * Produces a stable, downloadable shape that describes ONLY the user's
 * column-to-canonical mapping + chosen units + template provenance. The
 * payload is mapping/config only:
 *  - never includes parsed row values
 *  - never includes raw CSV row data
 *  - never includes user_id, grow_id, plant_id, tent_id, Supabase IDs,
 *    tokens, secrets, or private environment values
 *
 * Hard constraints (enforced by tests):
 *  - Pure, deterministic, no I/O, no React, no Supabase.
 *  - No DB writes, no functions.invoke, no service_role.
 *  - schema_version is stable; bump only on breaking changes.
 *  - data_context is always "mapping_config" so consumers can refuse to
 *    treat the payload as a sensor reading.
 *  - source_label is "csv_preview" or "representative_csv" — never "live".
 */

import {
  REPRESENTATIVE_MAPPING_FIELDS,
  type EcUnit,
  type RepresentativeColumnMapping,
  type RepresentativeMappingField,
  type TempUnit,
} from "@/lib/representativeCsvSensorPreviewRules";

export const CSV_MAPPING_CONFIG_SCHEMA_VERSION = 1 as const;
export const CSV_MAPPING_CONFIG_DATA_CONTEXT = "mapping_config" as const;

export type CsvMappingSourceLabel = "csv_preview" | "representative_csv";

export interface CsvMappingConfigWarning {
  code:
    | "missing_required_header"
    | "duplicate_canonical_mapping"
    | "ambiguous_template_match"
    | "unmapped_required_field";
  field: RepresentativeMappingField | string;
  message: string;
}

export interface CsvMappingConfig {
  schema_version: typeof CSV_MAPPING_CONFIG_SCHEMA_VERSION;
  data_context: typeof CSV_MAPPING_CONFIG_DATA_CONTEXT;
  source_label: CsvMappingSourceLabel;
  template_id: string | null;
  template_name: string | null;
  created_at: string;
  /** Canonical field → selected CSV header (null = unmapped). */
  mapping: Record<RepresentativeMappingField, string | null>;
  units: {
    air_temp: TempUnit;
    substrate_temp: TempUnit;
    substrate_ec: EcUnit;
  };
  /** Headers present in the CSV but not mapped to any canonical field. */
  ignored_headers: string[];
  /** Canonical fields the user left unmapped. */
  unmapped_fields: RepresentativeMappingField[];
  /** Template warnings or missing-required-header warnings, if any. */
  warnings: CsvMappingConfigWarning[];
}

export interface BuildCsvMappingConfigArgs {
  mapping: RepresentativeColumnMapping;
  headers: ReadonlyArray<string>;
  templateId?: string | null;
  templateName?: string | null;
  sourceLabel?: CsvMappingSourceLabel;
  warnings?: ReadonlyArray<CsvMappingConfigWarning>;
  now?: () => Date;
}

function headerFor(
  value: RepresentativeColumnMapping[keyof RepresentativeColumnMapping],
): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value;
  return value.column;
}

/**
 * Build a mapping-only config object suitable for client-side download.
 * Pure: never reads sensor rows, parsed values, or user identity.
 */
export function buildCsvMappingConfig(
  args: BuildCsvMappingConfigArgs,
): CsvMappingConfig {
  const {
    mapping,
    headers,
    templateId = null,
    templateName = null,
    sourceLabel = "representative_csv",
    warnings = [],
    now,
  } = args;

  const mappingOut = {} as Record<RepresentativeMappingField, string | null>;
  const used = new Set<string>();
  const unmapped: RepresentativeMappingField[] = [];

  for (const f of REPRESENTATIVE_MAPPING_FIELDS) {
    const header = headerFor(mapping[f]);
    mappingOut[f] = header;
    if (header) used.add(header);
    else unmapped.push(f);
  }
  const ignored_headers = headers.filter((h) => !used.has(h));
  const created_at = (now ? now() : new Date()).toISOString();

  return {
    schema_version: CSV_MAPPING_CONFIG_SCHEMA_VERSION,
    data_context: CSV_MAPPING_CONFIG_DATA_CONTEXT,
    source_label: sourceLabel,
    template_id: templateId,
    template_name: templateName,
    created_at,
    mapping: mappingOut,
    units: {
      air_temp: mapping.air_temp.unit,
      substrate_temp: mapping.substrate_temp.unit,
      substrate_ec: mapping.substrate_ec.unit,
    },
    ignored_headers,
    unmapped_fields: unmapped,
    warnings: [...warnings],
  };
}

export function csvMappingConfigFileName(): string {
  return "verdant-csv-mapping-preset.json";
}
