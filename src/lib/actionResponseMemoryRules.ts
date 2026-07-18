/**
 * actionResponseMemoryRules — Milestone 5 canonical Action Response Memory.
 *
 * Turns the completed Action Queue lifecycle into durable, read-only plant
 * memory: completed action → grower-recorded follow-up outcome → optional
 * note → optional existing-photo reference → optional sensor snapshot.
 *
 * Pure, typed, deterministic. No React, no I/O, no Supabase, no writes.
 * Identical input produces identical output.
 *
 * Truth boundary:
 *  - A memory records what the grower observed and when. Copy built from it
 *    says "Grower-recorded" / "recorded after action completion" — it never
 *    claims the action changed the plant.
 *  - The outcome is ONLY the grower's explicit selection persisted on the
 *    Slice 4c evidence row (`details.outcome`). It is never inferred from
 *    notes, photos, sensor rows, alerts, or timestamps.
 *  - The join is ONLY the validated `details.action_queue_id` written by the
 *    evidence service from the RLS-reverified action row. Note text,
 *    timestamps, or photo/sensor ids are never used to pair rows.
 *  - Legacy auto-reminder rows (same event_type, no explicit outcome) are
 *    NOT response memories; they stay with their existing legacy presenters.
 */

import { ACTION_FOLLOWUP_EVENT_TYPE } from "@/lib/actionFollowupRules";
import { type ActionFollowUpOutcome } from "@/lib/actionFollowUpEvidenceRules";
import {
  actionFollowUpOutcomeLabel,
  isActionFollowUpOutcome,
} from "@/lib/actionFollowUpEvidenceViewModel";
import { normalizeSensorSource } from "@/lib/sensor/sensorSourceRules";
import { isDiagnosticSensorProvenanceRow } from "@/lib/sensorProvenanceFenceRules";

// ---------------------------------------------------------------------------
// Shared copy (single source for all three surfaces)
// ---------------------------------------------------------------------------

export const ACTION_RESPONSE_MEMORY_TITLE = "Action response";
export const ACTION_RESPONSE_MEMORY_RECORDED_COPY = "Grower-recorded follow-up";
export const ACTION_RESPONSE_MEMORY_HISTORICAL_COPY =
  "Historical evidence — not current room conditions.";

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export type ActionResponseScopeLevel = "plant" | "tent" | "grow";

export type ActionResponsePhotoState = "none" | "available" | "unavailable";

export type ActionResponseSensorState = "none" | "available" | "unavailable";

/**
 * Provenance-truth state for the associated sensor snapshot. Mirrors the
 * repo's sensor-source vocabulary: only a literal `live` source is trusted;
 * manual stays manual, csv stays csv, demo stays demo, stale stays stale,
 * invalid stays invalid, and anything unrecognized is unknown — never
 * trusted, never live, never healthy.
 */
export type ActionResponseSensorTrustState =
  | "trusted"
  | "manual"
  | "csv"
  | "demo"
  | "stale"
  | "invalid"
  | "unknown";

export type ActionResponseLimitation =
  | "duplicate_response_rows"
  | "duplicate_conflicting_outcomes"
  | "sensor_lookup_unavailable";

export interface ActionResponseMemory {
  /** Opaque stable key for React lists. Never rendered as text. */
  readonly key: string;
  /** Internal join id. Used for links/lookups only — never visible text. */
  readonly actionId: string;

  readonly scope: {
    readonly growId: string;
    readonly tentId: string | null;
    readonly plantId: string | null;
    readonly level: ActionResponseScopeLevel;
  };

  readonly action: {
    readonly status: "completed";
    /** Sanitized grower-facing action summary, or null when unavailable. */
    readonly summary: string | null;
    readonly completedAt: string | null;
  };

  readonly response: {
    /** Diary row id of the selected evidence row. Internal only. */
    readonly rowId: string;
    /** Grower-entered observed_at when valid, else the row's entry_at. */
    readonly recordedAt: string;
    readonly outcome: ActionFollowUpOutcome;
    /** From the single centralized outcome-label mapping. */
    readonly outcomeLabel: string;
    readonly note: string | null;
  };

  readonly photo: {
    readonly state: ActionResponsePhotoState;
    /** Durable storage reference. Internal only — never visible text. */
    readonly durableReference: string | null;
  };

  readonly sensor: {
    readonly state: ActionResponseSensorState;
    /** sensor_readings row id. Internal only — never visible text. */
    readonly snapshotId: string | null;
    readonly capturedAt: string | null;
    readonly source: string | null;
    readonly trustState: ActionResponseSensorTrustState;
  };

  readonly historicalOnly: true;
  readonly limitations: readonly ActionResponseLimitation[];
}

// ---------------------------------------------------------------------------
// Inputs (already-loaded rows; the service selects only these fields)
// ---------------------------------------------------------------------------

export interface ActionResponseDiaryRowInput {
  readonly id: string;
  readonly grow_id: string | null;
  readonly tent_id: string | null;
  readonly plant_id: string | null;
  readonly entry_at?: string | null;
  readonly details?: Record<string, unknown> | null;
}

export interface ActionResponseActionRowInput {
  readonly id: string;
  readonly grow_id: string | null;
  readonly tent_id: string | null;
  readonly plant_id: string | null;
  readonly status: string | null;
  readonly suggested_change?: string | null;
  readonly completed_at?: string | null;
}

export interface ActionResponseSensorRowInput {
  readonly id: string;
  readonly tent_id?: string | null;
  readonly source?: string | null;
  readonly quality?: string | null;
  readonly captured_at?: string | null;
  /** Opaque provenance envelope used only to prevent diagnostic promotion. */
  readonly raw_payload?: unknown;
}

export interface BuildActionResponseMemoriesInput {
  readonly responseRows: readonly ActionResponseDiaryRowInput[] | null | undefined;
  readonly actions: readonly ActionResponseActionRowInput[] | null | undefined;
  /**
   * Optional resolved sensor rows for the snapshot ids referenced by the
   * response rows. When omitted entirely, referenced snapshots are reported
   * as `unavailable` with a `sensor_lookup_unavailable` limitation.
   */
  readonly sensorRows?: readonly ActionResponseSensorRowInput[] | null;
}

// ---------------------------------------------------------------------------
// Candidate detection (shared with Timeline's filter wiring)
// ---------------------------------------------------------------------------

function detailString(
  details: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const v = details?.[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * True when a diary `details` object is a canonical grower response:
 * the Slice 4c evidence event with an explicit valid outcome and an
 * authoritative action reference. Marker/legacy rows return false.
 */
export function isActionResponseCandidateDetails(
  details: Record<string, unknown> | null | undefined,
): boolean {
  if (!details) return false;
  return (
    details.event_type === ACTION_FOLLOWUP_EVENT_TYPE &&
    detailString(details, "action_queue_id") !== null &&
    isActionFollowUpOutcome(details.outcome)
  );
}

/** Filter already-loaded diary rows down to canonical response candidates. */
export function collectActionResponseCandidateRows<T extends ActionResponseDiaryRowInput>(
  rows: readonly T[] | null | undefined,
): T[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => r && isActionResponseCandidateDetails(r.details ?? null));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseEpochMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

function scopeLevel(plantId: string | null, tentId: string | null): ActionResponseScopeLevel {
  if (plantId) return "plant";
  if (tentId) return "tent";
  return "grow";
}

/** Reject references that look like signed/object URLs; durable refs only. */
const NON_DURABLE_REFERENCE_PATTERNS = [
  /^https?:\/\//i,
  /^blob:/i,
  /^data:/i,
  /token=/i,
  /signature=/i,
];

function classifyPhotoReference(reference: string | null): ActionResponsePhotoState {
  if (!reference) return "none";
  if (NON_DURABLE_REFERENCE_PATTERNS.some((re) => re.test(reference))) {
    return "unavailable";
  }
  return "available";
}

function classifySensorTrust(row: ActionResponseSensorRowInput): ActionResponseSensorTrustState {
  // Store-level `source = live` only proves accepted transport. The shared
  // provenance fence distinguishes Windows diagnostics from physical gateway
  // packets. Diagnostic evidence stays demo-backed historical context.
  if (isDiagnosticSensorProvenanceRow(row)) return "demo";
  const raw = typeof row.source === "string" ? row.source.trim().toLowerCase() : "";
  if (raw.length === 0) return "invalid";
  const normalized = normalizeSensorSource(raw);
  switch (normalized) {
    case "live":
      return row.quality === "ok" ? "trusted" : "unknown";
    case "manual":
      return "manual";
    case "csv":
      return "csv";
    case "demo":
      return "demo";
    case "stale":
      return "stale";
    default:
      // normalizeSensorSource collapses every unrecognized provenance string
      // to "invalid". Keep the honest split: a literal "invalid" source stays
      // invalid; anything unrecognized is unknown — and neither is ever
      // trusted or live.
      return raw === "invalid" ? "invalid" : "unknown";
  }
}

interface CandidateProjection {
  readonly row: ActionResponseDiaryRowInput;
  readonly actionId: string;
  readonly outcome: ActionFollowUpOutcome;
  readonly recordedAtMs: number;
  readonly recordedAt: string;
}

function projectCandidate(row: ActionResponseDiaryRowInput): CandidateProjection | null {
  const details = row.details ?? null;
  const actionId = detailString(details, "action_queue_id");
  if (!actionId) return null;
  const outcomeRaw = details?.outcome;
  if (!isActionFollowUpOutcome(outcomeRaw)) return null;

  // Authoritative response time: grower-entered observed_at when it parses,
  // else the row's entry_at. Invalid timestamps fail closed (row excluded).
  const observedAt = detailString(details, "observed_at");
  const observedMs = parseEpochMs(observedAt);
  const entryMs = parseEpochMs(row.entry_at ?? null);
  const recordedAtMs = observedMs ?? entryMs;
  if (recordedAtMs === null) return null;
  const recordedAt = observedMs !== null ? (observedAt as string) : (row.entry_at as string);

  return { row, actionId, outcome: outcomeRaw, recordedAtMs, recordedAt };
}

// ---------------------------------------------------------------------------
// Canonical build
// ---------------------------------------------------------------------------

/**
 * Build the canonical, deduplicated, validated Action Response Memory list.
 *
 * Rules enforced here (never in JSX):
 *  - only completed actions with an explicitly grower-recorded outcome;
 *  - join strictly by the authoritative `action_queue_id`;
 *  - grow/tent/plant agreement between action and response — mismatches are
 *    rejected, never broadened;
 *  - deterministic duplicate selection (earliest row id wins — the same
 *    convention as the evidence service's pickPrimary) with an internal
 *    limitation flag; contradictory duplicate outcomes are flagged, never
 *    silently merged;
 *  - stable ordering: recordedAt desc → actionId asc → rowId asc;
 *  - invalid timestamps fail closed.
 */
export function buildActionResponseMemories(
  input: BuildActionResponseMemoriesInput,
): ActionResponseMemory[] {
  const rows = collectActionResponseCandidateRows(input.responseRows);
  const actionsById = new Map<string, ActionResponseActionRowInput>();
  for (const a of input.actions ?? []) {
    if (a && typeof a.id === "string" && a.id.length > 0) actionsById.set(a.id, a);
  }
  const sensorLookupProvided = input.sensorRows !== undefined && input.sensorRows !== null;
  const sensorsById = new Map<string, ActionResponseSensorRowInput>();
  for (const s of input.sensorRows ?? []) {
    if (s && typeof s.id === "string" && s.id.length > 0) sensorsById.set(s.id, s);
  }

  // Group candidates by action id in one pass.
  const byAction = new Map<string, CandidateProjection[]>();
  for (const row of rows) {
    const projected = projectCandidate(row);
    if (!projected) continue;
    const list = byAction.get(projected.actionId);
    if (list) list.push(projected);
    else byAction.set(projected.actionId, [projected]);
  }

  const memories: ActionResponseMemory[] = [];

  for (const [actionId, candidates] of byAction) {
    const action = actionsById.get(actionId);
    // No authoritative action row, or not a completed action → not memory.
    if (!action || action.status !== "completed") continue;
    if (!action.grow_id) continue;

    // Scope agreement: reject rows that disagree with the action's scope.
    const agreeing = candidates.filter((c) => {
      const r = c.row;
      if (r.grow_id && r.grow_id !== action.grow_id) return false;
      if (r.tent_id && action.tent_id && r.tent_id !== action.tent_id) return false;
      if (r.plant_id && action.plant_id && r.plant_id !== action.plant_id) return false;
      return true;
    });
    if (agreeing.length === 0) continue;

    // Deterministic selection: earliest row id wins (pickPrimary convention).
    const sorted = [...agreeing].sort((a, b) =>
      a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0,
    );
    const primary = sorted[0];

    const limitations: ActionResponseLimitation[] = [];
    if (sorted.length > 1) {
      limitations.push("duplicate_response_rows");
      if (sorted.some((c) => c.outcome !== primary.outcome)) {
        limitations.push("duplicate_conflicting_outcomes");
      }
    }

    const details = primary.row.details ?? null;
    const note = detailString(details, "note");
    const photoReference = detailString(details, "photo_reference");
    const sensorSnapshotId = detailString(details, "sensor_snapshot_id");

    let sensor: ActionResponseMemory["sensor"];
    if (!sensorSnapshotId) {
      sensor = {
        state: "none",
        snapshotId: null,
        capturedAt: null,
        source: null,
        trustState: "unknown",
      };
    } else if (!sensorLookupProvided) {
      limitations.push("sensor_lookup_unavailable");
      sensor = {
        state: "unavailable",
        snapshotId: sensorSnapshotId,
        capturedAt: null,
        source: null,
        trustState: "unknown",
      };
    } else {
      const row = sensorsById.get(sensorSnapshotId);
      if (!row) {
        sensor = {
          state: "unavailable",
          snapshotId: sensorSnapshotId,
          capturedAt: null,
          source: null,
          trustState: "unknown",
        };
      } else {
        const capturedMs = parseEpochMs(row.captured_at ?? null);
        sensor = {
          state: "available",
          snapshotId: sensorSnapshotId,
          capturedAt: capturedMs !== null ? (row.captured_at as string) : null,
          source: typeof row.source === "string" ? row.source : null,
          trustState: capturedMs === null ? "invalid" : classifySensorTrust(row),
        };
      }
    }

    const outcomeLabel = actionFollowUpOutcomeLabel(primary.outcome);
    if (!outcomeLabel) continue; // defensive: label mapping is authoritative

    const summaryRaw =
      typeof action.suggested_change === "string" ? action.suggested_change.trim() : "";
    const completedMs = parseEpochMs(action.completed_at ?? null);

    memories.push({
      key: `action-response:${actionId}:${primary.row.id}`,
      actionId,
      scope: {
        growId: action.grow_id,
        tentId: action.tent_id ?? null,
        plantId: action.plant_id ?? null,
        level: scopeLevel(action.plant_id ?? null, action.tent_id ?? null),
      },
      action: {
        status: "completed",
        summary: summaryRaw.length > 0 ? summaryRaw : null,
        completedAt: completedMs !== null ? (action.completed_at as string) : null,
      },
      response: {
        rowId: primary.row.id,
        recordedAt: primary.recordedAt,
        outcome: primary.outcome,
        outcomeLabel,
        note,
      },
      photo: {
        state: classifyPhotoReference(photoReference),
        durableReference: photoReference,
      },
      sensor,
      historicalOnly: true,
      limitations,
    });
  }

  // Stable ordering: recordedAt desc → actionId asc → rowId asc.
  memories.sort((a, b) => {
    const at = Date.parse(a.response.recordedAt);
    const bt = Date.parse(b.response.recordedAt);
    if (at !== bt) return bt - at;
    if (a.actionId !== b.actionId) return a.actionId < b.actionId ? -1 : 1;
    return a.response.rowId < b.response.rowId ? -1 : a.response.rowId > b.response.rowId ? 1 : 0;
  });

  return memories;
}

// ---------------------------------------------------------------------------
// Plant Detail selection (hard exact-plant scope)
// ---------------------------------------------------------------------------

/**
 * Newest canonical response whose ACTION is scoped to exactly this plant.
 * Tent-level (plant_id null) and grow-level actions never appear on a
 * plant's page; wrong-plant records are excluded, never broadened.
 */
export function selectRecentPlantActionResponse(
  memories: readonly ActionResponseMemory[] | null | undefined,
  plantId: string | null | undefined,
): ActionResponseMemory | null {
  if (!Array.isArray(memories) || !plantId) return null;
  for (const m of memories) {
    if (m.scope.level === "plant" && m.scope.plantId === plantId) return m;
  }
  return null;
}
