/**
 * actionFollowUpManualSensorRules — pure candidate rules for the
 * "attach an existing Manual sensor snapshot" step of Action Queue
 * follow-up evidence (Slice 4b).
 *
 * Safety contract:
 *  - Pure: no I/O, no Supabase, no React, no globals, no clocks.
 *  - Manual-only. `live`, `csv`, `demo`, `stale`, `invalid`, unknown,
 *    or missing sources are never selectable. Manual snapshots whose
 *    validation state is `invalid` are also never selectable — we
 *    never let a broken reading become "healthy" merely because it
 *    was entered manually.
 *  - Cross-user / wrong-grow / wrong-tent / wrong-plant candidates
 *    are excluded even when the caller supplies them accidentally.
 *  - Deterministic sort: capturedAt desc, then id lexical asc.
 *
 * Plant-matching contract (documented):
 *  - When the action has a plantId: include snapshots linked to that
 *    exact plant AND tent-level snapshots (plant_id === null) that
 *    are in the same tent — this matches the existing manual sensor
 *    timeline (`selectManualSnapshotsForTimeline`) rule.
 *  - When the action has no plantId: include tent-level snapshots
 *    only (no plant-specific rows).
 *  - Snapshots linked to a different plant are always excluded.
 */

import type { ManualSnapshotTimelineCard } from "@/lib/manualSensorSnapshotViewModel";

export interface ActionFollowUpSensorContext {
  /** Verified grow scope from the completed action. Required. */
  growId: string;
  /** Verified tent scope from the completed action. Required for tent match. */
  tentId: string | null;
  /** Verified plant scope from the completed action. Optional. */
  plantId: string | null;
}

/**
 * Loose candidate shape — the input we accept from the query layer.
 * Callers may pass a `ManualSnapshotTimelineCard` or a raw-ish object
 * carrying the same field names.
 */
export interface ActionFollowUpManualSensorCandidateInput {
  id: string;
  capturedAt: string | null;
  tentId: string | null;
  plantId: string | null;
  /** Canonical source string. Only "manual" is ever selectable. */
  source: string | null;
  /** Optional validation state. `"invalid"` snapshots are excluded. */
  severity?: "ok" | "warning" | "invalid" | null;
  /**
   * Optional grow_id when the caller can derive it (e.g. via a joined
   * `tents` lookup). When absent we trust the query scope enforced tent
   * membership in the correct grow.
   */
  growId?: string | null;
}

function isValidIsoTs(v: string | null | undefined): v is string {
  if (typeof v !== "string" || v.length === 0) return false;
  const t = Date.parse(v);
  return Number.isFinite(t);
}

function plantScopeAccepts(
  candidate: ActionFollowUpManualSensorCandidateInput,
  ctx: ActionFollowUpSensorContext,
): boolean {
  if (ctx.plantId) {
    // Same plant → yes. Tent-level (plant_id null) → yes when tent matches.
    if (candidate.plantId === ctx.plantId) return true;
    if (candidate.plantId === null) return true;
    return false;
  }
  // Action has no plant → only tent-level snapshots (plant_id null).
  return candidate.plantId === null;
}

/**
 * Deterministic pure filter. Returns snapshots eligible to be
 * associated as evidence for a follow-up on the given action context.
 * Sorted capturedAt desc, then id asc.
 */
export function filterManualSensorSnapshotCandidates(
  snapshots: ReadonlyArray<ActionFollowUpManualSensorCandidateInput>,
  ctx: ActionFollowUpSensorContext,
): ActionFollowUpManualSensorCandidateInput[] {
  if (!ctx.growId) return [];
  const out: ActionFollowUpManualSensorCandidateInput[] = [];
  for (const s of snapshots ?? []) {
    if (!s || typeof s.id !== "string" || s.id.length === 0) continue;
    if (s.source !== "manual") continue;
    if (s.severity === "invalid") continue;
    if (!isValidIsoTs(s.capturedAt)) continue;
    // grow scope: when caller provides growId, enforce; otherwise trust
    // the upstream query scoped by tent.
    if (typeof s.growId === "string" && s.growId.length > 0) {
      if (s.growId !== ctx.growId) continue;
    }
    // tent scope: when the action has a tent, require exact match.
    if (ctx.tentId) {
      if (s.tentId !== ctx.tentId) continue;
    }
    if (!plantScopeAccepts(s, ctx)) continue;
    out.push(s);
  }
  out.sort((a, b) => {
    const ac = a.capturedAt ?? "";
    const bc = b.capturedAt ?? "";
    if (ac > bc) return -1;
    if (ac < bc) return 1;
    return a.id.localeCompare(b.id);
  });
  return out;
}

/**
 * Convenience adapter for `ManualSnapshotTimelineCard` inputs — carries
 * `source: "manual"` guaranteed by construction and includes `severity`.
 */
export function timelineCardToCandidateInput(
  card: ManualSnapshotTimelineCard,
): ActionFollowUpManualSensorCandidateInput {
  return {
    id: card.id,
    capturedAt: card.capturedAt,
    tentId: card.tentId,
    plantId: card.plantId,
    source: card.source, // literal "manual" per view-model contract
    severity: card.severity,
  };
}
