// Pure, deterministic field-mapping explanation for the EcoWitt ingest dry-run.
// Read-only. No I/O. No Supabase. No network. No AI.
//
// Explains which canonical CanonicalEcowittTentSnapshot fields populate which
// dry-run ingest payload keys, whether they're required, the current value,
// and a per-row status the operator UI can render.

import { CanonicalEcowittTentSnapshot } from "./ecowittTentSnapshot";

export type EcowittDryRunFieldStatus =
  | "mapped"
  | "missing_required"
  | "missing_optional"
  | "blocked"
  | "warning";

export interface EcowittDryRunFieldRow {
  ingest_key: string;
  source_field: string;
  required: boolean;
  value: string | number | null;
  status: EcowittDryRunFieldStatus;
  note?: string;
}

function present(v: unknown): boolean {
  return v !== null && v !== undefined && v !== "";
}

function optionalMetricRow(
  ingest_key: string,
  source_field: string,
  value: number | null,
): EcowittDryRunFieldRow {
  return {
    ingest_key,
    source_field,
    required: false,
    value,
    status: present(value) ? "mapped" : "missing_optional",
    note: present(value) ? undefined : "Optional metric not present in snapshot.",
  };
}

/**
 * Build the deterministic field-mapping rows for a canonical snapshot.
 * Pure: same input → same output.
 */
export function buildEcowittIngestDryRunFieldMap(
  snap: CanonicalEcowittTentSnapshot,
): readonly EcowittDryRunFieldRow[] {
  const m = snap.metrics;

  const rows: EcowittDryRunFieldRow[] = [
    {
      ingest_key: "air_temp_f",
      source_field: "metrics.air_temp_f",
      required: true,
      value: m.air_temp_f,
      status: present(m.air_temp_f) ? "mapped" : "missing_required",
      note: present(m.air_temp_f)
        ? undefined
        : "Required metric missing — dry-run cannot be marked sendable.",
    },
    {
      ingest_key: "humidity_pct",
      source_field: "metrics.humidity_pct",
      required: true,
      value: m.humidity_pct,
      status: present(m.humidity_pct) ? "mapped" : "missing_required",
      note: present(m.humidity_pct)
        ? undefined
        : "Required metric missing — dry-run cannot be marked sendable.",
    },
    optionalMetricRow("soil_temp_f", "metrics.soil_temp_f", m.soil_temp_f),
    optionalMetricRow(
      "soil_moisture_pct_primary",
      "metrics.soil_moisture_pct_primary",
      m.soil_moisture_pct_primary,
    ),
    optionalMetricRow(
      "soil_moisture_pct_secondary",
      "metrics.soil_moisture_pct_secondary",
      m.soil_moisture_pct_secondary,
    ),
    {
      ingest_key: "captured_at",
      source_field: "captured_at",
      required: true,
      value: snap.captured_at,
      status: present(snap.captured_at) ? "mapped" : "missing_required",
    },
    {
      ingest_key: "source",
      source_field: "source",
      required: true,
      value: snap.source,
      status:
        snap.source === "invalid"
          ? "blocked"
          : snap.source === "degraded"
            ? "warning"
            : "mapped",
      note:
        snap.source === "invalid"
          ? "Invalid source blocks dry-run send."
          : snap.source === "degraded"
            ? "Degraded source surfaces a warning."
            : undefined,
    },
    {
      ingest_key: "metadata.root_zone_confidence",
      source_field: "root_zone_confidence",
      required: false,
      value: snap.root_zone_confidence,
      status:
        snap.root_zone_confidence === "missing"
          ? "warning"
          : snap.root_zone_confidence === "partial"
            ? "warning"
            : "mapped",
    },
    {
      ingest_key: "metadata.degraded_reasons",
      source_field: "degraded_reasons",
      required: false,
      value: snap.degraded_reasons.length,
      status: snap.degraded_reasons.length > 0 ? "warning" : "mapped",
    },
    {
      ingest_key: "metadata.invalid_reasons",
      source_field: "invalid_reasons",
      required: false,
      value: snap.invalid_reasons.length,
      status: snap.invalid_reasons.length > 0 ? "blocked" : "mapped",
    },
  ];

  return Object.freeze(rows);
}
