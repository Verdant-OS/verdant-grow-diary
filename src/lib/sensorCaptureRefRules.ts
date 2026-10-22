/**
 * Capture identity for tent environment evidence (#2303, Codex P1 at fa8edcff).
 *
 * A capture ref names the stored record a value came from, so a check on "the
 * capture behind this VPD" joins on identity rather than on a shared
 * timestamp:
 *
 * - `diary:<id>`: one diary entry (`diary_evidence_ref`). Every metric in it
 *   is one capture; another diary entry, or any sensor row, is another.
 * - `sensor:<epoch ms>:<source family>`: sensor rows. Each metric is its own
 *   `sensor_readings` row with its own id and no shared capture id, so one
 *   ingest's rows are tied by their captured instant and source (live and
 *   stale are one family). This is the only identity the sensor store has.
 * - `null`: unknown (no diary ref, no per-metric ref, or no source). Callers
 *   fall back to their conservative instant match.
 *
 * Pure.
 */
import { normalizeSensorSource } from "@/lib/sensor/sensorSourceRules";

export type SensorCaptureRef = string;

/** The capture ref of a sensor row captured at `at` with raw `source`. */
export function sensorCaptureRef(
  at: string | null | undefined,
  source: unknown,
): SensorCaptureRef | null {
  if (!at || source == null || source === "") return null;
  const ms = Date.parse(at);
  if (!Number.isFinite(ms)) return null;
  const normalized = normalizeSensorSource(source);
  return `sensor:${ms}:${normalized === "stale" ? "live" : normalized}`;
}

/** The capture ref of a stored or synthesized evidence row. */
export function rowCaptureRef(row: {
  capture_ref?: string | null;
  captured_at?: string | null;
  ts?: string | null;
  source?: unknown;
}): SensorCaptureRef | null {
  if (row.capture_ref) return row.capture_ref;
  return sensorCaptureRef(row.captured_at ?? row.ts, row.source);
}

/** The capture ref of a diary entry, or null without its id. */
export function diaryCaptureRef(id: string | null | undefined): SensorCaptureRef | null {
  return id ? `diary:${id}` : null;
}

/**
 * The capture ref of one metric in a snapshot: its diary entry, else the
 * exact sensor row behind that metric, else unknown.
 */
export function snapshotCaptureRef(
  snapshot: {
    diary_evidence_ref?: { id: string } | null;
    metric_refs?: Partial<Record<string, { captured_at: string; source: string }>>;
  },
  key: string,
): SensorCaptureRef | null {
  const diary = diaryCaptureRef(snapshot.diary_evidence_ref?.id);
  if (diary) return diary;
  const ref = snapshot.metric_refs?.[key];
  return ref ? sensorCaptureRef(ref.captured_at, ref.source) : null;
}

/** True when every ref is known. */
export function captureRefsKnown(
  refs: readonly (SensorCaptureRef | null)[] | null | undefined,
): refs is readonly SensorCaptureRef[] {
  return !!refs && refs.length > 0 && refs.every((ref) => ref != null);
}
