/**
 * csvImportIdempotency — pure deterministic helpers for the future
 * CSV/TSV → sensor_readings import flow.
 *
 * Hard constraints (Safe-by-Design):
 *  - No I/O: no fetch, no Supabase, no Edge Functions, no Storage uploads.
 *  - No writes anywhere.
 *  - No alerts, no Action Queue, no AI calls, no device control.
 *  - These helpers ONLY produce stable string identifiers.
 *
 * Hash is FNV-1a 64-bit (in two 32-bit halves) emitted as 16 hex chars.
 * Deterministic, sync, browser-safe — no Node `crypto` import.
 */

const FNV_OFFSET_HI = 0xcbf2_9ce4;
const FNV_OFFSET_LO = 0x8422_2325;
const FNV_PRIME_LO = 0x0000_01b3;
// 64-bit FNV prime is 0x100000001b3. We multiply via 32-bit halves below.

function fnv1a64Hex(input: string): string {
  let hi = FNV_OFFSET_HI >>> 0;
  let lo = FNV_OFFSET_LO >>> 0;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i) & 0xff;
    lo = (lo ^ code) >>> 0;
    // hash *= 0x100000001b3, computed with 32-bit halves
    const loMul = lo * FNV_PRIME_LO;
    const hiMul = hi * FNV_PRIME_LO + lo; // 2^32 * lo (the 0x100000000 term)
    lo = loMul >>> 0;
    hi = (hiMul + Math.floor(loMul / 0x1_0000_0000)) >>> 0;
  }
  return (
    hi.toString(16).padStart(8, "0") + lo.toString(16).padStart(8, "0")
  );
}

/** Build a stable device_id for a CSV/TSV file. Filename is hashed, never raw. */
export function buildCsvImportDeviceId(filename: string): string {
  const safe = (filename ?? "").trim();
  return `csv:${fnv1a64Hex(safe)}`;
}

export interface CsvImportBatchIdInput {
  filename: string;
  tentId: string;
  importedAtIso: string;
}

/** Stable batch id for a single import attempt. */
export function buildCsvImportBatchId(input: CsvImportBatchIdInput): string {
  const composite = `${input.tentId}|${fnv1a64Hex(input.filename ?? "")}|${input.importedAtIso}`;
  return fnv1a64Hex(composite);
}

export interface CsvImportRowIdempotencyInput {
  tentId: string;
  /** Pre-built via buildCsvImportDeviceId — already hashed. */
  deviceId: string;
  metric: string;
  capturedAtIso: string;
  value: number;
}

/** Deterministic per-row key. Excludes user_id, raw filename, and tokens. */
export function buildCsvImportRowIdempotencyKey(
  input: CsvImportRowIdempotencyInput,
): string {
  const v = Number.isFinite(input.value) ? input.value : 0;
  const rounded = Math.round(v * 10_000) / 10_000;
  const composite = [
    input.tentId,
    input.deviceId,
    input.metric,
    input.capturedAtIso,
    rounded.toFixed(4),
  ].join("|");
  return fnv1a64Hex(composite);
}
