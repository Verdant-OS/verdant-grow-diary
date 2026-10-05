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
 *   - has the same captured instant as the ref,
 *   - and does not contradict the ref's claimed source.
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
import type {
  OriginatingTimelineEventRef,
  OriginatingTimelineEventSource,
} from "@/lib/originatingTimelineEventRules";

/** Stored columns needed to verify a ref. Selected under RLS. */
export interface EvidenceSensorRow {
  readonly id: string;
  readonly tent_id: string | null;
  readonly source: string | null;
  readonly quality: string | null;
  readonly captured_at: string | null;
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
export function storedEvidenceSource(row: EvidenceSensorRow): OriginatingTimelineEventSource {
  const quality = (row.quality ?? "").trim().toLowerCase();
  if (quality === "invalid") return "invalid";
  if (quality === "stale") return "stale";
  // Any quality other than "ok" (degraded, missing, unknown) is never shown
  // as trusted evidence, whatever the source (#1845 review).
  if (quality !== "ok") return "unknown";
  const raw = (row.source ?? "").trim().toLowerCase();
  const canonical = normalizeSensorSource(raw);
  if (canonical === "invalid" && raw !== "invalid") return "unknown";
  return canonical;
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
  readonly read: EvidenceRowsRead;
}): Map<string, EvidenceRefVerification> {
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
    if (!sameInstant(ref.occurred_at, row.captured_at)) {
      out.set(ref.id, unverified("timestamp_mismatch"));
      continue;
    }
    const stored = storedEvidenceSource(row);
    const claimed = ref.source ?? "unknown";
    if (claimed !== "unknown" && claimed !== stored) {
      out.set(ref.id, unverified("source_mismatch"));
      continue;
    }
    out.set(ref.id, { status: "verified", reason: "verified", displaySource: stored });
  }
  return out;
}
