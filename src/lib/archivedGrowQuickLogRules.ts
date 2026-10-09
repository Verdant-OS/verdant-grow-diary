/**
 * Archived-grow Quick Log and restore decisions.
 *
 * Pure. The active-grow roster stays non-archived so free-tier counts and
 * the current setup do not move. A named plant in an archived grow still
 * reaches a final target in one call: notes may save there, and every other
 * log kind stops with a terminal message. The stored active grow id is left
 * unchanged.
 */

import { FREE_GROW_LIMIT_BLOCKED_COPY } from "@/lib/entitlements/freeTierGates";
import {
  QUICK_LOG_TARGET_BLOCKED_COPY,
  resolveQuickLogEditorTarget,
  resolveQuickLogPrefillTarget,
  type QuickLogTargetPlant,
  type QuickLogTargetResolution,
  type QuickLogTargetTent,
} from "@/lib/quickLogTargetIntegrityRules";

export const ARCHIVED_GROW_QUICK_LOG_BLOCKED_COPY = QUICK_LOG_TARGET_BLOCKED_COPY.grow_archived;

export const GROW_RESTORE_FAILED_COPY = "Unable to restore this grow. Please try again." as const;

const FREE_ACTIVE_GROW_LIMIT_REACHED = "free_active_grow_limit_reached";

const NOTE_EVENT_TYPES = new Set(["observation", "note", "photo"]);
const NOTE_ACTIVITY_IDS = new Set(["note", "photo", "issue_observation"]);

export function isArchivedGrowId(
  growId: string | null | undefined,
  archivedGrowIds: ReadonlySet<string> | readonly string[] | null | undefined,
): boolean {
  if (typeof growId !== "string") return false;
  const id = growId.trim();
  if (!id) return false;
  const ids = archivedGrowIds instanceof Set ? archivedGrowIds : new Set(archivedGrowIds ?? []);
  return ids.has(id);
}

/**
 * Legacy Quick Log defaults to an observation, which persists as a note.
 * An explicit non-note event type or activity wins over that default.
 * V2 uses its own action and is decided by the caller before this helper.
 */
export function isArchivedGrowQuickLogNote(input: {
  eventType?: string | null;
  activityId?: string | null;
}): boolean {
  const activityId =
    typeof input.activityId === "string" ? input.activityId.trim().toLowerCase() : "";
  if (activityId && !NOTE_ACTIVITY_IDS.has(activityId)) return false;
  const eventType =
    typeof input.eventType === "string" && input.eventType.trim().length > 0
      ? input.eventType.trim().toLowerCase()
      : "observation";
  return NOTE_EVENT_TYPES.has(eventType);
}

export function isArchivedGrowNoteActivity(activityId: string | null | undefined): boolean {
  if (typeof activityId !== "string") return false;
  return NOTE_ACTIVITY_IDS.has(activityId.trim().toLowerCase());
}

export function partitionGrowsByArchive<T extends { is_archived?: boolean | null }>(
  rows: readonly T[],
): { active: T[]; archived: T[] } {
  const active: T[] = [];
  const archived: T[] = [];
  for (const row of rows) {
    if (row.is_archived === true) archived.push(row);
    else active.push(row);
  }
  return { active, archived };
}

/**
 * The stored active grow changes only for a named grow that is still active.
 * An archived grow id is never written back into the current setup.
 */
export function nextStoredActiveGrowIdForNamedGrow(input: {
  storedActiveGrowId: string | null;
  requestedGrowId: string | null | undefined;
  archivedGrowIds: ReadonlySet<string> | readonly string[] | null | undefined;
}): string | null {
  if (isArchivedGrowId(input.requestedGrowId, input.archivedGrowIds)) {
    return input.storedActiveGrowId;
  }
  const requested =
    typeof input.requestedGrowId === "string" && input.requestedGrowId.trim().length > 0
      ? input.requestedGrowId.trim()
      : null;
  if (requested && requested !== input.storedActiveGrowId) return requested;
  return input.storedActiveGrowId;
}

export interface ArchivedGrowQuickLogLaunch {
  readonly resolution: QuickLogTargetResolution;
  readonly nextStoredActiveGrowId: string | null;
  /** True only when the editor is still waiting on a grow switch. */
  readonly confirming: boolean;
}

/**
 * One-call launcher decision for a plant the route or tent page already named.
 * The write side is the mismatch the active-grow store produces when it
 * refuses to select an archived grow. The result is ready or terminally
 * blocked; it is never `prefill_target_pending`.
 */
export function resolveArchivedGrowQuickLogLaunch(input: {
  storedActiveGrowId: string | null;
  prefill: { plantId: string; growId?: string | null; tentId?: string | null };
  plants: readonly QuickLogTargetPlant[];
  tents: readonly QuickLogTargetTent[];
  archivedGrowIds: readonly string[];
  eventType?: string | null;
  activityId?: string | null;
}): ArchivedGrowQuickLogLaunch {
  const prefillResolution = resolveQuickLogPrefillTarget({
    prefill: input.prefill,
    plants: input.plants,
    tents: input.tents,
    requireTent: false,
  });
  const requestedGrowId =
    prefillResolution.status === "ready" ? prefillResolution.target.growId : input.prefill.growId;
  const namedGrowArchived = isArchivedGrowId(requestedGrowId, input.archivedGrowIds);
  const resolution = resolveQuickLogEditorTarget({
    prefill: input.prefill,
    prefillResolution,
    writeResolution: { status: "blocked", reason: "active_grow_mismatch" },
    namedGrowArchived,
    allowArchivedGrowNote: isArchivedGrowQuickLogNote({
      eventType: input.eventType,
      activityId: input.activityId,
    }),
  });
  return {
    resolution,
    nextStoredActiveGrowId: nextStoredActiveGrowIdForNamedGrow({
      storedActiveGrowId: input.storedActiveGrowId,
      requestedGrowId,
      archivedGrowIds: input.archivedGrowIds,
    }),
    confirming: resolution.status === "blocked" && resolution.reason === "prefill_target_pending",
  };
}

export function quickLogArchivedGrowActionBlock(input: {
  growId: string | null | undefined;
  action: string | null | undefined;
  archivedGrowIds: ReadonlySet<string> | readonly string[] | null | undefined;
}): string | null {
  if (!isArchivedGrowId(input.growId, input.archivedGrowIds)) return null;
  if (input.action === "note") return null;
  return ARCHIVED_GROW_QUICK_LOG_BLOCKED_COPY;
}

export function planGrowRestore(input: { allowed: boolean; blockedCopy: string | null }): {
  proceed: boolean;
  errorCopy: string | null;
} {
  if (input.allowed) return { proceed: true, errorCopy: null };
  return {
    proceed: false,
    errorCopy: input.blockedCopy ?? FREE_GROW_LIMIT_BLOCKED_COPY,
  };
}

export function growRestoreFailureCopy(
  error: {
    message?: string | null;
    code?: string | null;
    details?: string | null;
  } | null,
): string {
  const blob = `${error?.message ?? ""} ${error?.code ?? ""} ${error?.details ?? ""}`;
  if (blob.includes(FREE_ACTIVE_GROW_LIMIT_REACHED)) return FREE_GROW_LIMIT_BLOCKED_COPY;
  return GROW_RESTORE_FAILED_COPY;
}
