/**
 * Shared, pure provenance fence for sensor evidence consumers.
 *
 * The canonical stored source may be `live` for packets accepted through the
 * webhook transport. That label alone is not enough to distinguish Verdant's
 * Windows diagnostic sender from a physical EcoWitt gateway, so consumers
 * must retain `raw_payload` until this classifier runs.
 *
 * Raw payload is classification-only. Callers must strip it before returning
 * MCP content, persisting Quick Log details, or assembling model context.
 */
import { isSensorTestbenchRow } from "./sensorTestbenchIndicatorRules";

export interface SensorProvenanceRowLike {
  source?: string | null;
  raw_payload?: unknown;
}

/**
 * True when a row is diagnostic-only and must not count as plant evidence.
 *
 * `isSensorTestbenchRow` owns the physical-gateway exception: a Windows
 * listener row with preserved `reported_verdant_source=live` plus physical
 * gateway markers remains eligible. Its top-level legacy-source fallback
 * also fails closed when physical provenance cannot be proven.
 */
export function isDiagnosticSensorProvenanceRow(row: SensorProvenanceRowLike): boolean {
  return isSensorTestbenchRow(row);
}

/** Stable-order filter used by MCP, Quick Log, and AI evidence adapters. */
export function withoutDiagnosticSensorRows<T extends SensorProvenanceRowLike>(
  rows: readonly T[] | null | undefined,
): T[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => !isDiagnosticSensorProvenanceRow(row));
}
