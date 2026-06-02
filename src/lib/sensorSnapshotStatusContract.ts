/**
 * Sensor Snapshot Status Contract v1
 *
 * Pure, deterministic, source-honest classification of sensor snapshot
 * health. Consumed by (in later slices) the bridge health card, AI
 * Doctor readiness, and timeline/manual snapshot severity.
 *
 * Hard rules:
 *  - No fetch, no DB client, no browser storage, no console.*.
 *  - No `Date.now()` inside the classifier — `now` is an option.
 *  - Status is the classification. Reason is *why*. They are separate
 *    fields and never collapsed into compound variants like
 *    `stale_manual` or `invalid_source`.
 *  - Only `usable` may count as healthy evidence.
 *  - Stale-window thresholds come from this module — never JSX.
 *  - Presenter-safe labels. No IDs, payloads, tokens, or secrets.
 */

// ============================================================================
// Canonical contract (new spec)
// ============================================================================

export type SnapshotStatus =
  | "usable"
  | "stale"
  | "invalid"
  | "needs_review"
  | "no_data";

export type SnapshotReason =
  | "fresh_accepted"
  | "outside_stale_window"
  | "none_inserted"
  | "partial_accept"
  | "malformed_reading"
  | "out_of_range"
  | "unit_mismatch"
  | "no_rows"
  | "unknown";

export interface Classification {
  status: SnapshotStatus;
  reason: SnapshotReason;
  isHealthyEvidence: boolean;
  /** Presenter-safe one-liner. No IDs, payloads, or secrets. */
  label: string;
}

// --- Stale-window config ----------------------------------------------------

export const DEFAULT_STALE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Per-source overrides. Empty by default. Future source adapters can
 * register here without touching JSX or the classifier.
 */
export const PER_SOURCE_STALE_WINDOW_MS: Partial<Record<string, number>> = {};

export function resolveStaleWindowMs(source?: string | null): number {
  if (typeof source === "string" && source.length > 0) {
    const v = PER_SOURCE_STALE_WINDOW_MS[source];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  }
  return DEFAULT_STALE_WINDOW_MS;
}

// --- Labels (presenter-safe, no IDs/payloads/secrets) -----------------------

const LABELS: Record<SnapshotStatus, string> = {
  usable: "Latest bridge reading accepted.",
  stale: "Latest bridge reading is stale.",
  invalid: "Latest bridge reading is invalid.",
  needs_review: "Latest bridge reading needs review.",
  no_data: "No bridge readings received yet.",
};

// --- Classifier -------------------------------------------------------------

export interface AuditRowLike {
  rowsReceived: number;
  rowsAccepted: number;
  rowsRejected?: number;
  capturedAt?: string | Date | null;
  source?: string | null;
}

export interface ClassifyOptions {
  now?: Date;
  validity?: { isValid: boolean; reason?: SnapshotReason };
}

function parseDate(v: string | Date | null | undefined): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

function buildClassification(
  status: SnapshotStatus,
  reason: SnapshotReason,
): Classification {
  return {
    status,
    reason,
    isHealthyEvidence: status === "usable",
    label: LABELS[status],
  };
}

/**
 * Classification precedence — counts first, emptiness second:
 *
 *  1. `row == null`                    → no_data / no_rows
 *  2. `rowsReceived === 0`             → no_data / no_rows           (0/0)
 *  3. `rowsAccepted === 0`             → needs_review / none_inserted (5/0)
 *  4. `validity.isValid === false`     → invalid (validity.reason || malformed_reading)
 *  5. `rowsRejected > 0`               → needs_review / partial_accept
 *  6. accepted but capturedAt unparseable → needs_review / unknown
 *  7. age > resolveStaleWindowMs(src)  → stale / outside_stale_window
 *  8. otherwise                        → usable / fresh_accepted
 */
export function classifyAuditRow(
  row: AuditRowLike | null | undefined,
  opts: ClassifyOptions = {},
): Classification {
  if (row == null) {
    return buildClassification("no_data", "no_rows");
  }

  const received = Number(row.rowsReceived);
  if (!Number.isFinite(received) || received <= 0) {
    return buildClassification("no_data", "no_rows");
  }

  const accepted = Number(row.rowsAccepted);
  if (!Number.isFinite(accepted) || accepted <= 0) {
    return buildClassification("needs_review", "none_inserted");
  }

  if (opts.validity && opts.validity.isValid === false) {
    const reason: SnapshotReason = opts.validity.reason ?? "malformed_reading";
    return buildClassification("invalid", reason);
  }

  const rejected = Number(
    row.rowsRejected !== undefined ? row.rowsRejected : received - accepted,
  );
  if (Number.isFinite(rejected) && rejected > 0) {
    return buildClassification("needs_review", "partial_accept");
  }

  const captured = parseDate(row.capturedAt ?? null);
  if (!captured) {
    return buildClassification("needs_review", "unknown");
  }

  const now = opts.now ?? new Date(0); // caller must supply `now`; deterministic fallback
  const windowMs = resolveStaleWindowMs(row.source ?? null);
  if (now.getTime() - captured.getTime() > windowMs) {
    return buildClassification("stale", "outside_stale_window");
  }

  return buildClassification("usable", "fresh_accepted");
}

// --- Healthy-evidence gate --------------------------------------------------

/**
 * True ONLY for `usable`. Accepts either a `SnapshotStatus` value or a
 * full `Classification`.
 */
export function countsAsHealthyEvidence(
  input: SnapshotStatus | Classification | null | undefined,
): boolean {
  if (input == null) return false;
  if (typeof input === "string") return input === "usable";
  return input.status === "usable";
}

// ============================================================================
// Back-compat exports (consumed by the existing bridge health view model
// added in a prior slice). Additive only — do not modify behavior.
// ============================================================================

export type SensorSnapshotStatus = SnapshotStatus;

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

export const DEFAULT_SENSOR_SNAPSHOT_STALE_WINDOW_MS = DEFAULT_STALE_WINDOW_MS;
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
  const def = args.defaultMs ?? DEFAULT_STALE_WINDOW_MS;
  const overrides = args.overrides ?? SENSOR_SNAPSHOT_STALE_WINDOW_OVERRIDES_MS;
  const src = (args.source ?? "").toString().trim().toLowerCase();
  if (src && Object.prototype.hasOwnProperty.call(overrides, src)) {
    const v = overrides[src];
    if (Number.isFinite(v) && v > 0) return v;
  }
  // Fall back to the canonical resolver so per-source defaults stay aligned.
  return src ? resolveStaleWindowMs(src) : def;
}

export interface ClassifySensorSnapshotInput {
  rowsReceived?: number | null;
  rowsAccepted?: number | null;
  malformed?: boolean;
  capturedAt?: string | Date | null;
  source?: string | null;
  now?: Date;
  staleWindowMs?: number;
}

export function classifySensorSnapshotStatus(
  input: ClassifySensorSnapshotInput,
): SensorSnapshotStatusResult {
  if (input.malformed === true) {
    return { status: "invalid", reasonCode: "malformed_payload" };
  }
  const received = Number(input.rowsReceived ?? 0);
  if (!Number.isFinite(received) || received <= 0) {
    return { status: "no_data", reasonCode: "none_received" };
  }
  const accepted = Number(input.rowsAccepted ?? 0);
  if (!Number.isFinite(accepted) || accepted <= 0) {
    return { status: "needs_review", reasonCode: "none_accepted" };
  }
  if (accepted < received) {
    return { status: "needs_review", reasonCode: "partial_accept" };
  }
  const captured = parseDate(input.capturedAt ?? null);
  if (!captured) {
    return { status: "needs_review", reasonCode: "missing_timestamp" };
  }
  const now = input.now ?? new Date();
  const staleMs =
    input.staleWindowMs ??
    resolveSensorSnapshotStaleWindowMs({ source: input.source });
  if (now.getTime() - captured.getTime() > staleMs) {
    return { status: "stale", reasonCode: "stale_timestamp" };
  }
  return { status: "usable", reasonCode: "fresh_accept" };
}

export interface SensorEvidenceEvaluation {
  status: SensorSnapshotStatus;
  reasonCode: SensorSnapshotReasonCode | null;
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

export type SensorSnapshotSeverity =
  | "ok"
  | "warning"
  | "danger"
  | "unknown"
  | "empty";

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
