/**
 * Sensor Bridge Health — pure view-model for the read-only status card.
 *
 * Input: rows from `sensor_ingest_audit_log` (and optional bridge name).
 *
 * Refactored to consume the shared Sensor Snapshot Status Contract v1
 * (`@/lib/sensorSnapshotStatusContract`). Classification lives in the
 * contract; this file only maps audit rows into contract inputs and
 * produces UI copy. The card renders the result — it does not classify.
 *
 * Safety:
 *  - Never writes. Never alerts. Never queues actions. Never controls devices.
 *  - Never reads or exposes sensitive intake material.
 *  - Never classifies unknown telemetry as healthy.
 */

import {
  classifySensorSnapshotStatus,
  evaluateSensorSnapshotEvidence,
  resolveSensorSnapshotStaleWindowMs,
  type SensorSnapshotReasonCode,
  type SensorSnapshotStatus,
  type SensorSnapshotStatusResult,
} from "@/lib/sensorSnapshotStatusContract";

/** Re-exported for back-compat — prefer the contract module. */
export const SENSOR_BRIDGE_HEALTH_STALE_MS =
  resolveSensorSnapshotStaleWindowMs();

export const SENSOR_BRIDGE_CONTROL_DISCLOSURE = "No device control.";

/** Canonical contract status. */
export type SensorBridgeHealthState = SensorSnapshotStatus;

/**
 * Bridge-card-facing reason code. Sourced from the shared contract; the
 * UI may surface it verbatim (snake_case, no PII).
 */
export type SensorBridgeHealthReasonCode = SensorSnapshotReasonCode;

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
  status: SensorSnapshotStatus;
  headline: string;
  message: string;
  controlDisclosure: string;
  latestAcceptedAtIso: string | null;
  latestRejectedAtIso: string | null;
  latestReasonCode: SensorBridgeHealthReasonCode | null;
  sourceLabel: string | null;
  bridgeName: string | null;
  countsAsHealthyEvidence: boolean;
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

function classifyRow(
  r: SensorBridgeAuditRowLike,
  now: Date,
  staleMs?: number,
): SensorSnapshotStatusResult {
  return classifySensorSnapshotStatus({
    rowsReceived: Number(r.rows_received ?? 0),
    rowsAccepted: Number(r.rows_inserted ?? 0),
    capturedAt: rowTimestamp(r),
    source: r.source ?? null,
    now,
    staleWindowMs: staleMs,
  });
}

const MESSAGE_FOR_STATUS: Record<SensorSnapshotStatus, string> = {
  usable: "Latest bridge reading accepted.",
  stale: "Latest bridge reading is stale.",
  needs_review: "Latest bridge reading needs review.",
  invalid: "Latest bridge reading is invalid.",
  no_data: "No bridge readings received yet.",
};

export function buildSensorBridgeHealthViewModel(
  input: SensorBridgeHealthInput,
): SensorBridgeHealthViewModel {
  const now = input.now ?? new Date();
  const rows = (input.rows ?? []).slice();
  const bridgeName = input.bridgeName ?? null;

  if (rows.length === 0) {
    const evidence = evaluateSensorSnapshotEvidence({
      status: "no_data",
      reasonCode: "none_received",
    });
    return {
      state: "no_data",
      status: "no_data",
      headline: "Sensor bridge status",
      message: MESSAGE_FOR_STATUS.no_data,
      controlDisclosure: SENSOR_BRIDGE_CONTROL_DISCLOSURE,
      latestAcceptedAtIso: null,
      latestRejectedAtIso: null,
      latestReasonCode: null,
      sourceLabel: null,
      bridgeName,
      countsAsHealthyEvidence: evidence.countsAsHealthyEvidence,
    };
  }

  const sorted = rows
    .map((r) => ({ row: r, at: rowTimestamp(r) }))
    .filter((x): x is { row: SensorBridgeAuditRowLike; at: Date } => x.at !== null)
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  const latest = sorted[0] ?? null;

  // Latest accepted / rejected are derived independently to drive the
  // timestamp fields shown on the card.
  const isFullyAccepted = (r: SensorBridgeAuditRowLike) => {
    const received = Number(r.rows_received ?? 0);
    const inserted = Number(r.rows_inserted ?? 0);
    return received > 0 && inserted >= received;
  };
  const isRejectedOrPartial = (r: SensorBridgeAuditRowLike) => {
    const received = Number(r.rows_received ?? 0);
    const inserted = Number(r.rows_inserted ?? 0);
    return received > 0 && inserted < received;
  };

  const latestAccepted = sorted.find((x) => isFullyAccepted(x.row)) ?? null;
  const latestRejected = sorted.find((x) => isRejectedOrPartial(x.row)) ?? null;

  const classification = latest
    ? classifyRow(latest.row, now, input.staleMs)
    : { status: "no_data" as const, reasonCode: "none_received" as const };

  const evidence = evaluateSensorSnapshotEvidence(classification);

  const sourceRaw = latest?.row.source ?? null;
  const sourceLabel =
    typeof sourceRaw === "string" && sourceRaw.length > 0 ? sourceRaw : null;

  return {
    state: classification.status,
    status: classification.status,
    headline: "Sensor bridge status",
    message: MESSAGE_FOR_STATUS[classification.status],
    controlDisclosure: SENSOR_BRIDGE_CONTROL_DISCLOSURE,
    latestAcceptedAtIso: latestAccepted?.at.toISOString() ?? null,
    latestRejectedAtIso: latestRejected?.at.toISOString() ?? null,
    latestReasonCode: classification.reasonCode,
    sourceLabel,
    bridgeName,
    countsAsHealthyEvidence: evidence.countsAsHealthyEvidence,
  };
}
