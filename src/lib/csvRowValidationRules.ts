/**
 * CSV Row Validation Hints — pure presenter helpers.
 *
 * Translates a {@link RepresentativeDraftReading} plus the user's mapping
 * into row-level hints suitable for UI display. Adds extra suspicious-value
 * checks that the normalizer does not own (pH range, humidity stuck at
 * exactly 0 / 100, EC likely in µS/cm when mS/cm was selected).
 *
 * Hard constraints (tests enforced):
 *  - Pure, deterministic, no I/O, no React, no Supabase.
 *  - Never reclassifies unknown/suspicious telemetry as healthy.
 *  - Timestamp invalid/missing → row marked `not canonical-previewable`.
 */

import type {
  EcUnit,
  RepresentativeColumnMapping,
  RepresentativeDraftReading,
} from "@/lib/representativeCsvSensorPreviewRules";

export type CsvRowHintSeverity = "block" | "warn";

export interface CsvRowValidationHint {
  field?: string;
  severity: CsvRowHintSeverity;
  code: string;
  message: string;
}

export interface DeriveHintsArgs {
  row: RepresentativeDraftReading;
  mapping: RepresentativeColumnMapping;
}

export interface RowValidationOutcome {
  hints: CsvRowValidationHint[];
  canonicalPreviewable: boolean;
}

const REASON_TO_HINT: Record<string, { field: string; severity: CsvRowHintSeverity; message: string }> = {
  missing_timestamp: {
    field: "timestamp",
    severity: "block",
    message: "Timestamp is missing. Row is blocked from canonical preview.",
  },
  invalid_timestamp: {
    field: "timestamp",
    severity: "block",
    message: "Timestamp could not be parsed. Row is blocked from canonical preview.",
  },
  humidity_non_finite: {
    field: "humidity",
    severity: "warn",
    message: "Humidity value is not a number.",
  },
  vwc_non_finite: { field: "vwc", severity: "warn", message: "VWC value is not a number." },
  ec_non_finite: {
    field: "substrate_ec",
    severity: "warn",
    message: "EC value is not a number.",
  },
  air_temp_non_finite: {
    field: "air_temp",
    severity: "warn",
    message: "Air temperature value is not a number.",
  },
  substrate_temp_non_finite: {
    field: "substrate_temp",
    severity: "warn",
    message: "Substrate temperature value is not a number.",
  },
  humidity_out_of_range: {
    field: "humidity",
    severity: "warn",
    message: "Humidity is outside 0–100%.",
  },
  vwc_out_of_range: { field: "vwc", severity: "warn", message: "VWC is outside 0–100%." },
  vpd_negative: { field: "vpd", severity: "warn", message: "VPD is negative." },
  ec_impossible: {
    field: "substrate_ec",
    severity: "warn",
    message: "EC is negative.",
  },
  air_temp_impossible: {
    field: "air_temp",
    severity: "warn",
    message: "Air temperature is outside a plausible range.",
  },
  substrate_temp_impossible: {
    field: "substrate_temp",
    severity: "warn",
    message: "Substrate temperature is outside a plausible range.",
  },
};

function rawNumber(raw: string | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = Number(s.replace(/[,_]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function ecRawCell(
  row: RepresentativeDraftReading,
  mapping: RepresentativeColumnMapping,
): { rawNum: number | null; unit: EcUnit; header: string | null } {
  const header = mapping.substrate_ec.column;
  const cell = header ? row.raw_payload[header] : undefined;
  return { rawNum: rawNumber(cell), unit: mapping.substrate_ec.unit, header };
}

function findPhFromRawPayload(row: RepresentativeDraftReading): {
  header: string;
  value: number;
} | null {
  for (const [header, cell] of Object.entries(row.raw_payload)) {
    const name = header.toLowerCase().replace(/\s+/g, "_");
    if (name === "ph" || name.endsWith("_ph") || name.startsWith("ph_")) {
      const n = rawNumber(cell);
      if (n !== null) return { header, value: n };
    }
  }
  return null;
}

/**
 * Build row-level validation hints. Pure — no DOM, no I/O.
 */
export function deriveCsvRowValidationHints(
  args: DeriveHintsArgs,
): RowValidationOutcome {
  const { row, mapping } = args;
  const hints: CsvRowValidationHint[] = [];
  const seen = new Set<string>();

  for (const reason of row.reasons) {
    const tpl = REASON_TO_HINT[reason];
    if (!tpl || seen.has(reason)) continue;
    seen.add(reason);
    hints.push({ field: tpl.field, severity: tpl.severity, code: reason, message: tpl.message });
  }

  // Missing optional fields → warn (row still previewable).
  const optional: Array<{
    field: string;
    column: string | null;
    value: number | null;
    code: string;
    message: string;
  }> = [
    {
      field: "humidity",
      column: mapping.humidity.column,
      value: row.humidity_pct,
      code: "humidity_missing",
      message: "Humidity column is not mapped.",
    },
    {
      field: "co2",
      column: mapping.co2.column,
      value: row.co2_ppm,
      code: "co2_missing",
      message: "CO₂ column is not mapped.",
    },
    {
      field: "substrate_ec",
      column: mapping.substrate_ec.column,
      value: row.substrate_ec_mscm,
      code: "ec_missing",
      message: "EC column is not mapped.",
    },
    {
      field: "air_temp",
      column: mapping.air_temp.column,
      value: row.air_temp_c,
      code: "air_temp_missing",
      message: "Air temperature column is not mapped.",
    },
  ];
  for (const opt of optional) {
    if (opt.column === null) {
      hints.push({ field: opt.field, severity: "warn", code: opt.code, message: opt.message });
    }
  }

  // Humidity stuck at exactly 0 or 100 → suspicious.
  if (row.humidity_pct === 0 || row.humidity_pct === 100) {
    hints.push({
      field: "humidity",
      severity: "warn",
      code: "humidity_stuck",
      message: `Humidity reads exactly ${row.humidity_pct}% — sensor may be stuck.`,
    });
  }

  // pH outside realistic 4–9 range.
  const ph = findPhFromRawPayload(row);
  if (ph && (ph.value < 4 || ph.value > 9)) {
    hints.push({
      field: "ph",
      severity: "warn",
      code: "ph_out_of_range",
      message: `pH ${ph.value} is outside the realistic 4–9 range.`,
    });
  }

  // Suspicious EC unit: mS/cm selected but raw value > 50 (likely µS/cm).
  const ec = ecRawCell(row, mapping);
  if (ec.rawNum !== null && ec.unit === "mS/cm" && ec.rawNum > 50) {
    hints.push({
      field: "substrate_ec",
      severity: "warn",
      code: "ec_suspicious_units",
      message: `EC ${ec.rawNum} looks like µS/cm — confirm unit selection.`,
    });
  }

  const blocked = hints.some((h) => h.severity === "block");
  return { hints, canonicalPreviewable: !blocked };
}
