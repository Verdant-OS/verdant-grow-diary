/**
 * sensorHistoryImportFingerprintRules — pure deterministic fingerprint
 * for sensor history import adapter results.
 *
 * Hard contract:
 *  - Pure. No I/O. No Supabase. No alerts. No Action Queue. No AI.
 *    No device control. No schema/RLS/Edge changes.
 *  - Inputs limited to safe fields only:
 *      sourceAppId, tent_id, metric, captured_at, value, sensor_group
 *  - Never includes raw_payload, raw rows, device serials, bridge tokens,
 *    source file names, internal IDs, full import batch IDs, or user_id.
 *  - Output is a stable 16-hex FNV-1a 64-bit hash.
 */
import type { SensorHistoryImportSourceAppId } from "@/lib/sensorHistoryImportAuditLog";

const FNV_OFFSET_HI = 0xcbf2_9ce4;
const FNV_OFFSET_LO = 0x8422_2325;
const FNV_PRIME_LO = 0x0000_01b3;

function fnv1a64Hex(input: string): string {
  let hi = FNV_OFFSET_HI >>> 0;
  let lo = FNV_OFFSET_LO >>> 0;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i) & 0xff;
    lo = (lo ^ code) >>> 0;
    const loMul = lo * FNV_PRIME_LO;
    const hiMul = hi * FNV_PRIME_LO + lo;
    lo = loMul >>> 0;
    hi = (hiMul + Math.floor(loMul / 0x1_0000_0000)) >>> 0;
  }
  return (
    hi.toString(16).padStart(8, "0") + lo.toString(16).padStart(8, "0")
  );
}

export interface FingerprintRowInput {
  tent_id: string;
  metric: string;
  captured_at: string;
  value: number;
  sensor_group?: string | null;
}

export interface BuildSensorHistoryImportFingerprintInput {
  sourceAppId: SensorHistoryImportSourceAppId;
  rows: ReadonlyArray<FingerprintRowInput>;
}

function normRow(r: FingerprintRowInput): string {
  const v = Number.isFinite(r.value) ? Math.round(r.value * 10_000) / 10_000 : 0;
  const sg = r.sensor_group ? String(r.sensor_group).trim() : "";
  return [
    String(r.tent_id ?? "").trim(),
    String(r.metric ?? "").trim(),
    String(r.captured_at ?? "").trim(),
    v.toFixed(4),
    sg,
  ].join("|");
}

/**
 * Build a deterministic fingerprint for an import. Row order does not
 * matter — rows are canonicalized via sort before hashing.
 */
export function buildSensorHistoryImportFingerprint(
  input: BuildSensorHistoryImportFingerprintInput,
): string {
  const lines = input.rows.map(normRow).sort();
  const composite = `${input.sourceAppId}\n${lines.join("\n")}`;
  return fnv1a64Hex(composite);
}

/** Coerce arbitrary insert rows (CSV/XLSX adapter shapes) to the safe input. */
export function toFingerprintRows(
  rows: ReadonlyArray<{
    tent_id: string;
    metric: string;
    captured_at: string;
    value: number;
    raw_payload?: { sensor_group?: string | null } | null;
  }>,
): FingerprintRowInput[] {
  return rows.map((r) => ({
    tent_id: r.tent_id,
    metric: r.metric,
    captured_at: r.captured_at,
    value: r.value,
    sensor_group: r.raw_payload?.sensor_group ?? null,
  }));
}
