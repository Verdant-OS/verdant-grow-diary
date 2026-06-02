/**
 * Sensor Snapshot Status Contract v1
 *
 * Shared, source-honest classification used by:
 *   - the Sensor Bridge Health card / view model
 *   - AI Doctor readiness (sensor evidence gating)
 *   - timeline / manual snapshot severity surfaces
 *
 * Design rules (do not relax without explicit approval):
 *   - Status is the high-level classification. Reason codes explain *why*.
 *     There are NO status variants like `stale_manual` or `invalid_source`.
 *   - Only `usable` may count as healthy sensor evidence for AI Doctor.
 *   - Unknown / malformed / 0-rows-received telemetry is NEVER `usable`.
 *   - Stale-window thresholds come from a shared resolver, never JSX.
 *   - Pure. No I/O, no React, no Supabase client, no Date.now coupling.
 */

export type SensorSnapshotStatus =
  | "usable"
  | "stale"
  | "invalid"
  | "needs_review"
  | "no_data";

/**
 * Reason codes are intentionally separate from status. Keep them small,
 * snake_case, no SQL/PII/UUIDs. Multiple reasons may roll up to the same
 * status (e.g. `none_accepted` and `partial_accept` both → `needs_review`).
 */
export type SensorSnapshotReasonCode =
  | "fresh_accept"
  | "stale_timestamp"
  | "partial_accept"
  | "none_accepted"
  | "none_received"
  | "malformed_payload"
  | "missing_timestamp";

export interface SensorSnapshotStatusResult {
  status: SensorSnapshotStatus;
  reasonCode: SensorSnapshotReasonCode | null;
}

// --- Stale-window config ----------------------------------------------------

export const DEFAULT_SENSOR_SNAPSHOT_STALE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Per-source overrides. Empty by default. Future source adapters can add
 * entries here without touching JSX or the classifier.
 */
export const SENSOR_SNAPSHOT_STALE_WINDOW_OVERRIDES_MS: Readonly<
  Record<string, number>
> = Object.freeze({});

export interface ResolveStaleWindowArgs {
  source?: string | null;
  overrides?: Readonly<Record<string, number>>;
  defaultMs?: number;
}

export function resolveSensorSnapshotStaleWindowMs(
  args: ResolveStaleWindowArgs = {},
): number {
  const def = args.defaultMs ?? DEFAULT_SENSOR_SNAPSHOT_STALE_WINDOW_MS;
  const overrides = args.overrides ?? SENSOR_SNAPSHOT_STALE_WINDOW_OVERRIDES_MS;
  const src = (args.source ?? "").toString().trim().toLowerCase();
  if (src && Object.prototype.hasOwnProperty.call(overrides, src)) {
    const v = overrides[src];
    if (Number.isFinite(v) && v > 0) return v;
  }
  return def;
}

// --- Classifier -------------------------------------------------------------

export interface ClassifySensorSnapshotInput {
  /** Total rows the bridge/source reported it sent. */
  rowsReceived?: number | null;
  /** Rows that were actually accepted/inserted. */
  rowsAccepted?: number | null;
  /** Explicit malformed signal (parse error, bad ranges, schema mismatch). */
  malformed?: boolean;
  /** Latest sample timestamp (ISO string or Date). */
  capturedAt?: string | Date | null;
  /** Optional source label for per-source stale-window resolution. */
  source?: string | null;
  /** Wall clock for stale comparison. Tests inject this. */
  now?: Date;
  /** Override stale window for this call. Falls back to resolver. */
  staleWindowMs?: number;
}

function toDate(v: string | Date | null | undefined): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Pure classifier. Order of checks is significant:
 *   1. malformed → `invalid`
 *   2. rowsReceived === 0 → `no_data`
 *   3. rowsReceived > 0 && rowsAccepted === 0 → `needs_review` (none_accepted)
 *   4. rowsReceived > 0 && rowsAccepted < rowsReceived → `needs_review` (partial_accept)
 *   5. captured_at missing → `needs_review` (missing_timestamp)
 *   6. captured_at older than stale window → `stale`
 *   7. otherwise → `usable`
 */
export function classifySensorSnapshotStatus(
  input: ClassifySensorSnapshotInput,
): SensorSnapshotStatusResult {
  if (input.malformed === true) {
    return { status: "invalid", reasonCode: "malformed_payload" };
  }

  const received = Number(input.rowsReceived ?? 0);
  const accepted = Number(input.rowsAccepted ?? 0);

  if (!Number.isFinite(received) || received <= 0) {
    return { status: "no_data", reasonCode: "none_received" };
  }

  if (!Number.isFinite(accepted) || accepted <= 0) {
    return { status: "needs_review", reasonCode: "none_accepted" };
  }

  if (accepted < received) {
    return { status: "needs_review", reasonCode: "partial_accept" };
  }

  const captured = toDate(input.capturedAt ?? null);
  if (!captured) {
    return { status: "needs_review", reasonCode: "missing_timestamp" };
  }

  const now = input.now ?? new Date();
  const staleMs =
    input.staleWindowMs ??
    resolveSensorSnapshotStaleWindowMs({ source: input.source });
  const ageMs = now.getTime() - captured.getTime();
  if (ageMs > staleMs) {
    return { status: "stale", reasonCode: "stale_timestamp" };
  }

  return { status: "usable", reasonCode: "fresh_accept" };
}

// --- AI Doctor readiness adapter -------------------------------------------

export interface SensorEvidenceEvaluation {
  status: SensorSnapshotStatus;
  reasonCode: SensorSnapshotReasonCode | null;
  /**
   * Only `true` for `usable`. Stale / invalid / needs_review / no_data
   * MUST NOT count as healthy evidence for AI Doctor.
   */
  countsAsHealthyEvidence: boolean;
}

export function evaluateSensorSnapshotEvidence(
  result: SensorSnapshotStatusResult | null | undefined,
): SensorEvidenceEvaluation {
  if (!result) {
    return {
      status: "no_data",
      reasonCode: "none_received",
      countsAsHealthyEvidence: false,
    };
  }
  return {
    status: result.status,
    reasonCode: result.reasonCode,
    countsAsHealthyEvidence: result.status === "usable",
  };
}

// --- Timeline / manual snapshot severity adapter ---------------------------

export type SensorSnapshotSeverity =
  | "ok"
  | "warning"
  | "danger"
  | "unknown"
  | "empty";

/**
 * Adapter for timeline / manual snapshot surfaces. Preserves the status
 * distinction so the UI cannot flatten unsafe/unknown sensor state into a
 * generic "available" or "healthy" label.
 */
export function mapSensorSnapshotStatusToSeverity(
  status: SensorSnapshotStatus,
): SensorSnapshotSeverity {
  switch (status) {
    case "usable":
      return "ok";
    case "stale":
      return "warning";
    case "needs_review":
      return "warning";
    case "invalid":
      return "danger";
    case "no_data":
      return "empty";
    default:
      return "unknown";
  }
}
