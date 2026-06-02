/**
 * Sensor Bridge Health — pure view-model for the read-only status card.
 *
 * Input: rows from `sensor_ingest_audit_log` (and optional bridge name).
 *
 * Scope (intentionally narrow):
 *  - Derives a deterministic, UI-ready status from already-stored audit rows.
 *  - Never writes. Never alerts. Never queues actions. Never controls devices.
 *  - Never reads or exposes sensitive intake material.
 *  - Never classifies unknown telemetry as healthy.
 *  - Does not duplicate validation tables from sensorBridgeIntakeRules; this
 *    only maps post-validation audit rows into operator-visible labels.
 */

export const SENSOR_BRIDGE_HEALTH_STALE_MS = 24 * 60 * 60 * 1000;

export const SENSOR_BRIDGE_CONTROL_DISCLOSURE = "No device control.";

export type SensorBridgeHealthState =
  | "no_data"
  | "accepted"
  | "stale"
  | "needs_review";

/**
 * Safe, internal reason codes derived from audit-log counts.
 * Snake_case, no SQL keywords, no UUIDs, no PII.
 */
export type SensorBridgeHealthReasonCode =
  | "partial_accept"
  | "none_inserted";

export interface SensorBridgeAuditRowLike {
  source?: string | null;
  auth_type?: string | null;
  rows_received?: number | null;
  rows_inserted?: number | null;
  captured_at?: string | Date | null;
  created_at?: string | Date | null;
}

export interface SensorBridgeHealthViewModel {
  state: SensorBridgeHealthState;
  headline: string;
  message: string;
  controlDisclosure: string;
  latestAcceptedAtIso: string | null;
  latestRejectedAtIso: string | null;
  latestReasonCode: SensorBridgeHealthReasonCode | null;
  sourceLabel: string | null;
  bridgeName: string | null;
}

export interface SensorBridgeHealthInput {
  rows: ReadonlyArray<SensorBridgeAuditRowLike>;
  /** Optional human-safe bridge identity (e.g. a tent name). Never a credential. */
  bridgeName?: string | null;
  now?: Date;
  staleMs?: number;
}

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

function rowTimestamp(r: SensorBridgeAuditRowLike): Date | null {
  return toDate(r.created_at) ?? toDate(r.captured_at);
}

function isAccepted(r: SensorBridgeAuditRowLike): boolean {
  const received = Number(r.rows_received ?? 0);
  const inserted = Number(r.rows_inserted ?? 0);
  return inserted > 0 && inserted >= received;
}

function isRejectedOrPartial(r: SensorBridgeAuditRowLike): boolean {
  const received = Number(r.rows_received ?? 0);
  const inserted = Number(r.rows_inserted ?? 0);
  return received > 0 && inserted < received;
}

function reasonForRejection(
  r: SensorBridgeAuditRowLike,
): SensorBridgeHealthReasonCode | null {
  const received = Number(r.rows_received ?? 0);
  const inserted = Number(r.rows_inserted ?? 0);
  if (received <= 0) return null;
  if (inserted <= 0) return "none_inserted";
  if (inserted < received) return "partial_accept";
  return null;
}

export function buildSensorBridgeHealthViewModel(
  input: SensorBridgeHealthInput,
): SensorBridgeHealthViewModel {
  const now = input.now ?? new Date();
  const staleMs = input.staleMs ?? SENSOR_BRIDGE_HEALTH_STALE_MS;
  const rows = (input.rows ?? []).slice();

  if (rows.length === 0) {
    return {
      state: "no_data",
      headline: "Sensor bridge status",
      message: "No bridge readings received yet.",
      controlDisclosure: SENSOR_BRIDGE_CONTROL_DISCLOSURE,
      latestAcceptedAtIso: null,
      latestRejectedAtIso: null,
      latestReasonCode: null,
      sourceLabel: null,
      bridgeName: input.bridgeName ?? null,
    };
  }

  const sorted = rows
    .map((r) => ({ row: r, at: rowTimestamp(r) }))
    .filter((x): x is { row: SensorBridgeAuditRowLike; at: Date } => x.at !== null)
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  const latestAccepted = sorted.find((x) => isAccepted(x.row)) ?? null;
  const latestRejected = sorted.find((x) => isRejectedOrPartial(x.row)) ?? null;
  const latest = sorted[0] ?? null;

  const latestAcceptedAtIso = latestAccepted?.at.toISOString() ?? null;
  const latestRejectedAtIso = latestRejected?.at.toISOString() ?? null;

  // Determine state from the most recent row to be honest about current health.
  let state: SensorBridgeHealthState = "no_data";
  let message = "No bridge readings received yet.";
  let reason: SensorBridgeHealthReasonCode | null = null;

  if (latest) {
    const ageMs = now.getTime() - latest.at.getTime();
    const stale = ageMs > staleMs;

    if (isRejectedOrPartial(latest.row)) {
      state = "needs_review";
      message = "Latest bridge reading needs review.";
      reason = reasonForRejection(latest.row);
    } else if (stale) {
      state = "stale";
      message = "Latest bridge reading is stale.";
    } else if (isAccepted(latest.row)) {
      state = "accepted";
      message = "Latest bridge reading accepted.";
    } else {
      // Unknown — do not classify as healthy.
      state = "needs_review";
      message = "Latest bridge reading needs review.";
    }
  }

  const sourceRaw = latest?.row.source ?? null;
  const sourceLabel =
    typeof sourceRaw === "string" && sourceRaw.length > 0 ? sourceRaw : null;

  return {
    state,
    headline: "Sensor bridge status",
    message,
    controlDisclosure: SENSOR_BRIDGE_CONTROL_DISCLOSURE,
    latestAcceptedAtIso,
    latestRejectedAtIso,
    latestReasonCode: reason,
    sourceLabel,
    bridgeName: input.bridgeName ?? null,
  };
}
