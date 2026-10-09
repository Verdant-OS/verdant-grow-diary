/**
 * actionEvidenceVerificationRules — #1001.
 *
 * `action_queue.originating_timeline_events` is client-supplied (the
 * `action_queue_create` RPC only checks it is an array), so a ref's `source`
 * proves nothing. Sensor evidence is trusted only when the referenced
 * `sensor_readings` row:
 *   - is readable by the grower (RLS returns own rows only),
 *   - belongs to the action's tent. Evidence is verified against the
 *     action's TENT only: readings carry no plant_id, and action_queue_create
 *     accepts a tentless plant against any tent, so plant binding is NOT
 *     checked here,
 *   - measures the action's metric (`target_metric`, through the same alias
 *     table the alert-evidence proof uses); an action with no recognised
 *     metric cannot be verified,
 *   - is the effective reading: it is read from `sensor_readings_effective`,
 *     so a superseded manual reading is absent and an invalid correction
 *     lineage (`correction_valid` not true) never verifies,
 *   - has the same observation instant as the ref (`captured_at`, else `ts`,
 *     exactly as the snapshot builder resolved it),
 *   - and does not contradict the ref's claimed source. The claim is compared
 *     with the row's raw source; stored quality only changes what is shown.
 * The displayed provenance then comes from the STORED row (canonical
 * normalization + stored quality), never from the ref.
 *
 * Anything else is unverified context: never "Live", never trusted. A ref of
 * another kind that claims `live` is unverified too — live evidence can only
 * come from a stored sensor row. Other non-sensor refs are left untouched.
 *
 * Pure: no React, no I/O, no clock. Historical classification only — this
 * never makes current-freshness claims.
 */

import { normalizeSensorSource } from "@/lib/sensor/sensorSourceRules";
import { normalizeMetricKey } from "@/lib/oneTentLoopAlertEvidenceRules";
import { snapshotFromReadings, type SensorSnapshotMetricRefKey } from "@/lib/sensorSnapshot";
import { resolveSensorObservationTime } from "@/lib/sensorObservationTimeRules";
import type {
  OriginatingTimelineEventRef,
  OriginatingTimelineEventSource,
} from "@/lib/originatingTimelineEventRules";

/** Stored columns needed to verify a ref. Selected under RLS. */
export interface EvidenceSensorRow {
  readonly id: string;
  readonly tent_id: string | null;
  readonly metric: string | null;
  readonly source: string | null;
  readonly quality: string | null;
  readonly captured_at: string | null;
  readonly ts: string | null;
  /** From `sensor_readings_effective`; only `true` may verify. */
  readonly correction_valid: boolean | null;
}

export type EvidenceRowsRead =
  | { readonly status: "pending" }
  | { readonly status: "error" }
  | { readonly status: "ok"; readonly rows: ReadonlyArray<EvidenceSensorRow> };

export type EvidenceVerificationReason =
  | "verified"
  | "not_checked"
  | "read_failed"
  | "invalid_id"
  | "not_found"
  | "no_tent_scope"
  | "wrong_tent"
  | "correction_invalid"
  | "no_metric_scope"
  | "metric_mismatch"
  | "timestamp_mismatch"
  | "source_mismatch"
  | "live_not_verifiable";

export interface EvidenceRefVerification {
  readonly status: "verified" | "unverified";
  readonly reason: EvidenceVerificationReason;
  /** Source to display. From the stored row when verified; else "unknown". */
  readonly displaySource: OriginatingTimelineEventSource;
}

/** Upper bound on refs read back per action (one `in` query). */
export const MAX_VERIFIED_EVIDENCE_REFS = 50;

export const SENSOR_SNAPSHOT_REF_TYPE = "sensor_snapshot";

export const UNVERIFIED_EVIDENCE_LABEL = "Unverified";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Caution copy per unverified reason. Calm, no certainty, approval-required. */
export function unverifiedEvidenceCaution(reason: EvidenceVerificationReason): string {
  switch (reason) {
    case "not_checked":
      return "Unverified context — not yet checked against your stored sensor readings.";
    case "read_failed":
      return "Unverified context — couldn't check this against your stored sensor readings.";
    default:
      // Also shown when a real reading exists but is hidden (Free history
      // window under RLS) or sits past the verification cap, so don't claim
      // it doesn't exist — only that it couldn't be matched (DP P2-3).
      return "Unverified context — this couldn't be matched to a stored sensor reading you can see for this tent. Review before approving.";
  }
}

function isSensorRef(ref: OriginatingTimelineEventRef): boolean {
  return (ref.type ?? "").trim().toLowerCase() === SENSOR_SNAPSHOT_REF_TYPE;
}

function needsVerification(ref: OriginatingTimelineEventRef): boolean {
  return isSensorRef(ref) || ref.source === "live";
}

/**
 * Sorted, unique, UUID-shaped ids of sensor refs to read back, capped at
 * {@link MAX_VERIFIED_EVIDENCE_REFS}. Non-UUID ids are never queried.
 */
export function sensorEvidenceRefIdsToRead(
  refs: ReadonlyArray<OriginatingTimelineEventRef> | null | undefined,
): string[] {
  const ids = new Set<string>();
  for (const r of refs ?? []) {
    if (r && isSensorRef(r) && UUID_RE.test(r.id)) ids.add(r.id.toLowerCase());
  }
  return [...ids].sort().slice(0, MAX_VERIFIED_EVIDENCE_REFS);
}

/**
 * Provenance of a stored row in the timeline-evidence vocabulary. Stored
 * quality wins: stale/invalid map to themselves, any other non-"ok" quality
 * is "unknown"; unrecognized tokens are "unknown".
 */
export function storedEvidenceSource(
  row: Pick<EvidenceSensorRow, "source" | "quality">,
): OriginatingTimelineEventSource {
  const quality = (row.quality ?? "").trim().toLowerCase();
  if (quality === "invalid") return "invalid";
  if (quality === "stale") return "stale";
  // Any quality other than "ok" (degraded, missing, unknown) is never shown
  // as trusted evidence, whatever the source (#1845 review).
  if (quality !== "ok") return "unknown";
  return storedRawEvidenceSource(row);
}

/** The row's canonical source before quality is applied; the claim is checked against this. */
function storedRawEvidenceSource(
  row: Pick<EvidenceSensorRow, "source">,
): OriginatingTimelineEventSource {
  const raw = (row.source ?? "").trim().toLowerCase();
  const canonical = normalizeSensorSource(raw);
  if (canonical === "invalid" && raw !== "invalid") return "unknown";
  return canonical;
}

/** Snapshot metric key an action's `target_metric` refers to, or null. */
export function evidenceMetricKeyForAction(
  targetMetric: string | null | undefined,
): SensorSnapshotMetricRefKey | null {
  return normalizeMetricKey(targetMetric);
}

/**
 * True when the snapshot builder that produced the refs would file this row
 * under `key`. Asking the builder keeps its metric table the only mapping
 * site between snapshot keys and `sensor_readings.metric`.
 */
function rowMeasuresMetricKey(row: EvidenceSensorRow, key: SensorSnapshotMetricRefKey): boolean {
  const metric = (row.metric ?? "").trim();
  if (!metric) return false;
  const snapshot = snapshotFromReadings([
    { id: row.id, metric, value: null, ts: "1970-01-01T00:00:00.000Z" },
  ]);
  return snapshot?.metric_refs?.[key]?.id === row.id;
}

function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  return Number.isFinite(ta) && Number.isFinite(tb) && ta === tb;
}

const unverified = (reason: EvidenceVerificationReason): EvidenceRefVerification => ({
  status: "unverified",
  reason,
  displaySource: "unknown",
});

/**
 * Verification for every ref that needs it (sensor refs, and any ref that
 * claims `live`). Refs absent from the result are non-sensor evidence the
 * presenter renders as before.
 */
export function verifyActionEvidenceRefs(input: {
  readonly refs: ReadonlyArray<OriginatingTimelineEventRef> | null | undefined;
  readonly actionTentId: string | null | undefined;
  readonly actionTargetMetric: string | null | undefined;
  readonly read: EvidenceRowsRead;
}): Map<string, EvidenceRefVerification> {
  const expectedMetricKey = evidenceMetricKeyForAction(input.actionTargetMetric);
  const out = new Map<string, EvidenceRefVerification>();
  const rowsById = new Map<string, EvidenceSensorRow>();
  if (input.read.status === "ok") {
    for (const r of input.read.rows) rowsById.set(r.id.toLowerCase(), r);
  }
  const readable = new Set(sensorEvidenceRefIdsToRead(input.refs));

  for (const ref of input.refs ?? []) {
    if (!ref || !needsVerification(ref)) continue;
    if (!isSensorRef(ref)) {
      out.set(ref.id, unverified("live_not_verifiable"));
      continue;
    }
    if (!UUID_RE.test(ref.id)) {
      out.set(ref.id, unverified("invalid_id"));
      continue;
    }
    if (input.read.status === "pending") {
      out.set(ref.id, unverified("not_checked"));
      continue;
    }
    if (input.read.status === "error") {
      out.set(ref.id, unverified("read_failed"));
      continue;
    }
    const row = readable.has(ref.id.toLowerCase()) ? rowsById.get(ref.id.toLowerCase()) : undefined;
    if (!row) {
      out.set(ref.id, unverified("not_found"));
      continue;
    }
    if (!input.actionTentId) {
      out.set(ref.id, unverified("no_tent_scope"));
      continue;
    }
    if (row.tent_id !== input.actionTentId) {
      out.set(ref.id, unverified("wrong_tent"));
      continue;
    }
    if (row.correction_valid !== true) {
      out.set(ref.id, unverified("correction_invalid"));
      continue;
    }
    if (!expectedMetricKey) {
      out.set(ref.id, unverified("no_metric_scope"));
      continue;
    }
    if (!rowMeasuresMetricKey(row, expectedMetricKey)) {
      out.set(ref.id, unverified("metric_mismatch"));
      continue;
    }
    if (!sameInstant(ref.occurred_at, resolveSensorObservationTime(row))) {
      out.set(ref.id, unverified("timestamp_mismatch"));
      continue;
    }
    const stored = storedEvidenceSource(row);
    const claimed = ref.source ?? "unknown";
    // A ref records the row's source when it was captured; quality applied
    // since (stale, invalid) changes the label shown, not the claim (#1845).
    if (claimed !== "unknown" && claimed !== storedRawEvidenceSource(row) && claimed !== stored) {
      out.set(ref.id, unverified("source_mismatch"));
      continue;
    }
    out.set(ref.id, { status: "verified", reason: "verified", displaySource: stored });
  }
  return out;
}
