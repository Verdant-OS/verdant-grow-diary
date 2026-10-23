/**
 * Capture identity for tent environment evidence (#2303, Codex P1 at fa8edcff).
 *
 * A capture ref names the stored record a value came from, so a check on "the
 * capture behind this VPD" joins on identity rather than on a shared
 * timestamp:
 *
 * - `diary:<id>`: one diary entry (`diary_evidence_ref`, or a generic blob's
 *   `diary_capture_id`). Every metric in it
 *   is one capture; another diary entry, or any sensor row, is another.
 * - `sensor:<epoch ms>:<source family>[:dev:<device_id>]`: sensor rows. Each
 *   metric is its own `sensor_readings` row with no shared capture id, so one
 *   ingest's rows are tied by their captured instant, source family (live and
 *   stale are one) and `device_id` (owner decision on #2442). A row without a
 *   device_id is a legacy single-device row: it matches every device at its
 *   instant and family (`captureRefsMatch`), so it never splits a rejection.
 * - `null`: unknown (no diary ref, no per-metric ref, or no recognised
 *   source). Callers fall back to their conservative instant match.
 *
 * Pure.
 */
import { normalizeSensorSource } from "@/lib/sensor/sensorSourceRules";

export type SensorCaptureRef = string;

/** The capture ref of a sensor row captured at `at` with raw `source`. */
export function sensorCaptureRef(
  at: string | null | undefined,
  source: unknown,
  deviceId?: string | null,
): SensorCaptureRef | null {
  if (!at || source == null || source === "") return null;
  const ms = Date.parse(at);
  if (!Number.isFinite(ms)) return null;
  const normalized = normalizeSensorSource(source);
  // An invalid or unrecognised source (`invalid`, `unverified`, …) names no
  // ingest family, so the row's capture is unknown and callers match it by
  // instant: an explicitly invalid sibling still rejects a live capture at its
  // instant (Codex P1 on #2303 at b2606eca).
  if (normalized === "invalid") return null;
  const base = `sensor:${ms}:${normalized === "stale" ? "live" : normalized}`;
  const device = typeof deviceId === "string" ? deviceId.trim() : "";
  return device ? `${base}:dev:${device}` : base;
}

/** The ref without its device, or null for a ref that carries none. */
function withoutDevice(ref: SensorCaptureRef): SensorCaptureRef | null {
  const at = ref.indexOf(":dev:");
  return ref.startsWith("sensor:") && at !== -1 ? ref.slice(0, at) : null;
}

/**
 * True when two refs can name the same capture: equal, or one sensor ref has
 * no device_id and the other has the same instant and family. Unknown
 * (null) never matches here; callers keep their own instant fallback.
 */
export function captureRefsMatch(
  a: SensorCaptureRef | null | undefined,
  b: SensorCaptureRef | null | undefined,
): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return withoutDevice(a) === b || withoutDevice(b) === a;
}

/** True when `ref` matches any entry of `refs` (`captureRefsMatch`). */
export function captureRefIn(
  ref: SensorCaptureRef | null | undefined,
  refs: readonly (SensorCaptureRef | null)[],
): boolean {
  return refs.some((other) => captureRefsMatch(ref, other));
}

/** The capture ref of a stored or synthesized evidence row. */
export function rowCaptureRef(row: {
  capture_ref?: string | null;
  captured_at?: string | null;
  ts?: string | null;
  source?: unknown;
  device_id?: string | null;
}): SensorCaptureRef | null {
  if (row.capture_ref) return row.capture_ref;
  return sensorCaptureRef(row.captured_at ?? row.ts, row.source, row.device_id);
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
    diary_capture_id?: string | null;
    metric_refs?: Partial<Record<string, { captured_at: string; source: string }>>;
    metric_device_ids?: Partial<Record<string, string>>;
  },
  key: string,
): SensorCaptureRef | null {
  const diary = diaryCaptureRef(snapshot.diary_evidence_ref?.id ?? snapshot.diary_capture_id);
  if (diary) return diary;
  const ref = snapshot.metric_refs?.[key];
  return ref
    ? sensorCaptureRef(ref.captured_at, ref.source, snapshot.metric_device_ids?.[key])
    : null;
}

/** True when every ref is known. */
export function captureRefsKnown(
  refs: readonly (SensorCaptureRef | null)[] | null | undefined,
): refs is readonly SensorCaptureRef[] {
  return !!refs && refs.length > 0 && refs.every((ref) => ref != null);
}
