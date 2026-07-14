/**
 * manualSensorSnapshotEditRules — pure builders for the append-only
 * manual sensor snapshot edit history.
 *
 * Hard constraints:
 *  - Pure. No I/O, no React, no Supabase, no timers, no globals.
 *  - Only sanitized numeric metric fields cross the boundary.
 *  - Never carries raw_payload, vendor lineage, source_app, tokens,
 *    private IDs, filenames, or notes.
 *  - source_before / source_after MUST both be "manual". Any other
 *    value is a hard reject — the diff builder cannot be used to
 *    relabel a reading.
 *  - Empty diffs are rejected. `changed_fields` is deterministic
 *    (alphabetical).
 */

/** Whitelisted numeric metric fields safe to carry in old/new_values. */
export const MANUAL_EDIT_ALLOWED_FIELDS = [
  "co2_ppm",
  "humidity_pct",
  "ppfd",
  "reservoir_ec_mscm",
  "reservoir_ph",
  "soil_ec_mscm",
  "soil_moisture_pct",
  "soil_temp_c",
  "temperature_c",
  "vpd_kpa",
] as const;

export type ManualEditField = (typeof MANUAL_EDIT_ALLOWED_FIELDS)[number];

const ALLOWED_SET: ReadonlySet<string> = new Set(MANUAL_EDIT_ALLOWED_FIELDS);

export interface ManualEditSnapshotInput {
  /** Must be "manual". Any other value causes the diff to be rejected. */
  source: string;
  /** Optional sanitized numeric metric fields. Extra keys are ignored. */
  [k: string]: unknown;
}

export interface ManualEditDiffOk {
  ok: true;
  source_before: "manual";
  source_after: "manual";
  old_values: Partial<Record<ManualEditField, number>>;
  new_values: Partial<Record<ManualEditField, number>>;
  changed_fields: ManualEditField[];
}

export interface ManualEditDiffErr {
  ok: false;
  reason:
    | "non_manual_source"
    | "empty_diff"
    | "invalid_input";
}

export type ManualEditDiffResult = ManualEditDiffOk | ManualEditDiffErr;

function pickNumeric(
  snap: ManualEditSnapshotInput,
): Partial<Record<ManualEditField, number>> {
  const out: Partial<Record<ManualEditField, number>> = {};
  for (const key of Object.keys(snap)) {
    if (!ALLOWED_SET.has(key)) continue;
    const v = (snap as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      out[key as ManualEditField] = v;
    }
  }
  return out;
}

/** Deep-ish numeric equality with tolerance for floating-point noise. */
function eq(a: number | undefined, b: number | undefined): boolean {
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;
  return Math.abs(a - b) < 1e-9;
}

export interface BuildDiffArgs {
  original: ManualEditSnapshotInput;
  replacement: ManualEditSnapshotInput;
}

/**
 * Compute a sanitized, deterministic diff between two manual sensor
 * snapshots. Rejects any input whose source is not "manual".
 */
export function buildManualSensorSnapshotEditDiff(
  args: BuildDiffArgs,
): ManualEditDiffResult {
  if (!args || !args.original || !args.replacement) {
    return { ok: false, reason: "invalid_input" };
  }
  if (args.original.source !== "manual" || args.replacement.source !== "manual") {
    return { ok: false, reason: "non_manual_source" };
  }

  const before = pickNumeric(args.original);
  const after = pickNumeric(args.replacement);

  const keys = new Set<ManualEditField>([
    ...(Object.keys(before) as ManualEditField[]),
    ...(Object.keys(after) as ManualEditField[]),
  ]);

  const changed: ManualEditField[] = [];
  const old_values: Partial<Record<ManualEditField, number>> = {};
  const new_values: Partial<Record<ManualEditField, number>> = {};

  for (const k of keys) {
    if (!eq(before[k], after[k])) {
      changed.push(k);
      if (before[k] !== undefined) old_values[k] = before[k]!;
      if (after[k] !== undefined) new_values[k] = after[k]!;
    }
  }

  if (changed.length === 0) {
    return { ok: false, reason: "empty_diff" };
  }

  changed.sort();

  return {
    ok: true,
    source_before: "manual",
    source_after: "manual",
    old_values,
    new_values,
    changed_fields: changed,
  };
}

/**
 * Sanitize an optional grower-supplied change reason. Trims, caps length,
 * and returns null for empty input so the DB CHECK stays happy.
 */
export function sanitizeChangeReason(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, 500);
}
