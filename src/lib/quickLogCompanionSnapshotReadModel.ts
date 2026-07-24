/**
 * Read-side projection for Quick Log companion diary snapshots.
 *
 * `quicklog_save_event` stores typed Water telemetry in the companion
 * `diary_entries.details.sensor_snapshot` payload and links it to the primary
 * grow event with `details.linked_grow_event_id`. This module restores that
 * exact relationship for grouped timeline rendering and AI/readiness input.
 *
 * Safety contract:
 *  - Pure: no I/O, React, Supabase, timers, or mutation.
 *  - Joins by `linked_grow_event_id` only; timestamps are never used to pair
 *    different events.
 *  - Only source="manual" snapshots are eligible. Other/unknown sources are
 *    never relabeled.
 *  - Metrics pass through the existing companion normalizer and manual
 *    snapshot validation/card builders. Missing metrics stay missing.
 *  - Existing sibling environment-event groups have precedence and are never
 *    replaced by a companion projection.
 */

import {
  extractQuickLogCompanionView,
  type QuickLogDiaryRowLike,
} from "@/lib/quick-log/quickLogDiaryCompanionRules";
import {
  quickLogV2EnvironmentRowToManualSnapshotRecord,
  type QuickLogV2EnvironmentRow,
  type QuickLogV2SnapshotScope,
} from "@/lib/quickLogV2ManualSnapshotAdapter";
import {
  buildManualSnapshotTimelineCard,
  type ManualSnapshotTimelineCard,
} from "@/lib/manualSensorSnapshotViewModel";
import type { TimelineManualSnapshotItem, TimelineMemoryItem } from "@/lib/timelineFilterRules";
import type {
  QuickLogActionEvent,
  QuickLogTimelineEntry,
} from "@/lib/quickLogTimelineGroupingViewModel";

export interface QuickLogCompanionSnapshotDiaryRow extends QuickLogDiaryRowLike {
  id: string;
  entry_at: string;
  plant_id: string | null;
  tent_id: string | null;
  details: unknown;
}

export interface QuickLogCompanionSnapshotAttachment {
  linkedGrowEventId: string;
  diaryEntryId: string;
  environment: QuickLogV2EnvironmentRow;
  card: ManualSnapshotTimelineCard;
}

export interface AttachQuickLogCompanionSnapshotsResult {
  entries: QuickLogTimelineEntry[];
  /** Complete evidence items for TimelineMemory/AI Doctor readiness. */
  companionItems: TimelineManualSnapshotItem[];
  /** Exact parent ids whose eligible companions passed every verification fence. */
  verifiedLinkedGrowEventIds: string[];
}

function compareTimelineMemoryItems(a: TimelineMemoryItem, b: TimelineMemoryItem): number {
  const occurred = b.occurredAt.localeCompare(a.occurredAt);
  if (occurred !== 0) return occurred;
  const kind = a.kind.localeCompare(b.kind);
  if (kind !== 0) return kind;
  return a.key.localeCompare(b.key);
}

function groupedEnvironmentId(entry: QuickLogTimelineEntry): string | null {
  if (entry.kind === "action") return null;
  return entry.environment.id;
}

/**
 * Resolve the visible Timeline Memory projection against cards the grouped
 * Quick Log timeline actually owns. A companion is hidden only when the
 * grouped query contains that exact persisted diary-row id. If that query is
 * absent, failed, capped, or otherwise lacks the card, Timeline Memory keeps
 * the valid manual evidence visible instead of dropping it between readers.
 */
export function buildTimelineMemoryDisplayItems(
  baseDisplayItems: ReadonlyArray<TimelineMemoryItem>,
  companionItems: ReadonlyArray<TimelineManualSnapshotItem>,
  groupedEntries: ReadonlyArray<QuickLogTimelineEntry>,
): TimelineMemoryItem[] {
  const ownedEnvironmentIds = new Set<string>();
  for (const entry of groupedEntries ?? []) {
    const id = groupedEnvironmentId(entry);
    if (id) ownedEnvironmentIds.add(id);
  }

  const merged: TimelineMemoryItem[] = [...(baseDisplayItems ?? [])];
  const seen = new Set(merged.map((item) => `${item.kind}:${item.key}`));
  for (const companion of companionItems ?? []) {
    if (ownedEnvironmentIds.has(companion.key)) continue;
    const identity = `${companion.kind}:${companion.key}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    merged.push(companion);
  }

  return merged.sort(compareTimelineMemoryItems);
}

function rowMatchesScope(
  row: QuickLogCompanionSnapshotDiaryRow,
  scope: QuickLogV2SnapshotScope,
): boolean {
  if (scope.kind === "plant") {
    if (row.plant_id === scope.plantId) return true;
    return (
      row.plant_id === null &&
      typeof scope.tentId === "string" &&
      scope.tentId.length > 0 &&
      row.tent_id === scope.tentId
    );
  }
  return row.tent_id === scope.tentId;
}

function rowMatchesAction(
  row: QuickLogCompanionSnapshotDiaryRow,
  action: QuickLogActionEvent,
): boolean {
  return row.plant_id === action.plantId && row.tent_id === action.tentId;
}

function toEnvironmentRow(row: QuickLogCompanionSnapshotDiaryRow): QuickLogV2EnvironmentRow | null {
  const view = extractQuickLogCompanionView(row);
  const snapshot = view?.sensorSnapshot ?? null;
  if (!view || !snapshot || snapshot.source !== "manual") return null;
  if (!snapshot.capturedAt || Number.isNaN(Date.parse(snapshot.capturedAt))) return null;
  if (!row.tent_id || typeof row.tent_id !== "string") return null;

  const environment: NonNullable<QuickLogV2EnvironmentRow["environment"]> = {};
  if (typeof snapshot.metrics.temperature === "number") {
    environment.temperature_c = snapshot.metrics.temperature;
  }
  if (typeof snapshot.metrics.humidity === "number") {
    environment.humidity_pct = snapshot.metrics.humidity;
  }
  if (typeof snapshot.metrics.vpd === "number") {
    environment.vpd_kpa = snapshot.metrics.vpd;
  }

  // The typed Water companion owns only these environmental fields. A
  // companion containing no supported values must not create an empty card.
  if (Object.keys(environment).length === 0) return null;

  return {
    // This is the persisted diary row id, not a fabricated environment-event
    // id. It keeps card identity stable without claiming a sibling row exists.
    id: row.id,
    plant_id: row.plant_id,
    tent_id: row.tent_id,
    occurred_at: snapshot.capturedAt,
    event_type: "environment",
    source: snapshot.source,
    environment,
  };
}

function buildAttachment(
  row: QuickLogCompanionSnapshotDiaryRow,
  linkedGrowEventId: string,
): QuickLogCompanionSnapshotAttachment | null {
  const environment = toEnvironmentRow(row);
  if (!environment) return null;
  const record = quickLogV2EnvironmentRowToManualSnapshotRecord(environment);
  if (!record) return null;
  return {
    linkedGrowEventId,
    diaryEntryId: row.id,
    environment,
    card: buildManualSnapshotTimelineCard(record),
  };
}

/** Exact parent ids required to verify the eligible companion rows in hand. */
export function selectQuickLogCompanionLinkedGrowEventIds(
  diaryRows: ReadonlyArray<QuickLogCompanionSnapshotDiaryRow>,
): string[] {
  const ids = new Set<string>();
  for (const row of diaryRows ?? []) {
    if (!row || typeof row.id !== "string" || row.id.length === 0) continue;
    const view = extractQuickLogCompanionView(row);
    if (!view || !toEnvironmentRow(row)) continue;
    ids.add(view.linkedGrowEventId);
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
}

function compareAttachments(
  a: QuickLogCompanionSnapshotAttachment,
  b: QuickLogCompanionSnapshotAttachment,
): number {
  const captured = b.card.capturedAt.localeCompare(a.card.capturedAt);
  if (captured !== 0) return captured;
  return a.diaryEntryId.localeCompare(b.diaryEntryId);
}

function actionMatchesScope(action: QuickLogActionEvent, scope: QuickLogV2SnapshotScope): boolean {
  if (action.source !== "manual") return false;
  if (action.kind !== "water" && action.kind !== "note") return false;
  if (!action.tentId || Number.isNaN(Date.parse(action.occurredAt))) return false;
  if (scope.kind === "tent") return action.tentId === scope.tentId;
  if (action.plantId === scope.plantId) return true;
  return (
    action.plantId === null &&
    typeof scope.tentId === "string" &&
    scope.tentId.length > 0 &&
    action.tentId === scope.tentId
  );
}

function toTimelineItem(
  attachment: QuickLogCompanionSnapshotAttachment,
): TimelineManualSnapshotItem {
  return {
    kind: "manual_sensor_snapshot",
    key: attachment.card.id,
    occurredAt: attachment.card.capturedAt,
    card: attachment.card,
  };
}

/**
 * Attach eligible companion snapshots to standalone actions. Existing grouped
 * entries are returned unchanged so legacy sibling environment rows win.
 */
export function attachQuickLogCompanionSnapshots(
  entries: ReadonlyArray<QuickLogTimelineEntry>,
  diaryRows: ReadonlyArray<QuickLogCompanionSnapshotDiaryRow>,
  scope: QuickLogV2SnapshotScope,
  verifiedParentActions: ReadonlyArray<QuickLogActionEvent> = [],
): AttachQuickLogCompanionSnapshotsResult {
  const verifiedActions = new Map<string, QuickLogActionEvent>();
  const alreadyGroupedActionIds = new Set<string>();
  for (const entry of entries ?? []) {
    if (entry.kind === "environment") continue;
    verifiedActions.set(entry.action.id, entry.action);
    if (entry.kind === "grouped") alreadyGroupedActionIds.add(entry.action.id);
  }
  for (const action of verifiedParentActions ?? []) {
    if (actionMatchesScope(action, scope)) verifiedActions.set(action.id, action);
  }

  const candidates = new Map<string, QuickLogCompanionSnapshotAttachment[]>();
  for (const row of diaryRows ?? []) {
    if (!row || typeof row.id !== "string" || row.id.length === 0) continue;
    if (!rowMatchesScope(row, scope)) continue;
    const view = extractQuickLogCompanionView(row);
    if (!view) continue;
    if (alreadyGroupedActionIds.has(view.linkedGrowEventId)) continue;
    const action = verifiedActions.get(view.linkedGrowEventId);
    if (!action || !rowMatchesAction(row, action)) continue;
    const attachment = buildAttachment(row, view.linkedGrowEventId);
    if (!attachment) continue;
    const forAction = candidates.get(view.linkedGrowEventId) ?? [];
    forAction.push(attachment);
    candidates.set(view.linkedGrowEventId, forAction);
  }

  const selected = new Map<string, QuickLogCompanionSnapshotAttachment>();
  for (const [actionId, matches] of candidates) {
    matches.sort(compareAttachments);
    selected.set(actionId, matches[0]);
  }

  const companionItems: TimelineManualSnapshotItem[] = [];
  const consumedActionIds = new Set<string>();
  const merged = (entries ?? []).map((entry): QuickLogTimelineEntry => {
    if (entry.kind !== "action") return entry;
    const attachment = selected.get(entry.action.id);
    if (!attachment) return entry;
    consumedActionIds.add(entry.action.id);
    companionItems.push(toTimelineItem(attachment));
    return {
      kind: "grouped",
      occurredAt: entry.occurredAt,
      action: entry.action,
      environment: attachment.environment,
      environmentCard: attachment.card,
      actionSourceLabel: "Manual",
      environmentSourceLabel: "Manual",
    };
  });

  // Plant timelines intentionally do not render a tent-target Water action.
  // Its exact-linked manual snapshot is still valid tent environment context,
  // matching the established plant-or-tent-level environment predicate.
  for (const [actionId, attachment] of selected) {
    if (consumedActionIds.has(actionId)) continue;
    merged.push({
      kind: "environment",
      occurredAt: attachment.environment.occurred_at,
      environment: attachment.environment,
      environmentCard: attachment.card,
      environmentSourceLabel: "Manual",
    });
    companionItems.push(toTimelineItem(attachment));
  }

  merged.sort((a, b) => {
    const occurred = b.occurredAt.localeCompare(a.occurredAt);
    if (occurred !== 0) return occurred;
    const aId = a.kind === "environment" ? a.environment.id : a.action.id;
    const bId = b.kind === "environment" ? b.environment.id : b.action.id;
    return aId.localeCompare(bId);
  });

  companionItems.sort((a, b) => {
    const captured = b.occurredAt.localeCompare(a.occurredAt);
    if (captured !== 0) return captured;
    return a.key.localeCompare(b.key);
  });

  return {
    entries: merged,
    companionItems,
    verifiedLinkedGrowEventIds: [...selected.keys()].sort((a, b) => a.localeCompare(b)),
  };
}
