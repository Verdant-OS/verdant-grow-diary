/**
 * quickLogPostSaveScopeRules — pure helpers for post–Quick Log timeline scope.
 *
 * After a successful save, the grower's active setup and Timeline filter should
 * follow the grow that received the log. Otherwise a log saved under grow B
 * while active grow is A never appears on /logs until the grower notices.
 *
 * Pure: no React, no Supabase, no side effects.
 */
import { logsPath } from "@/lib/routes";

export interface EntryCreatedScopeDetail {
  createdAt: string;
  growId?: string | null;
  plantId?: string | null;
  tentId?: string | null;
  /** Optional event id from grow_events / diary row. */
  growEventId?: string | null;
  source?: string | null;
}

/** Extract a usable grow id from a CustomEvent detail blob. */
export function growIdFromEntryCreatedDetail(detail: unknown): string | null {
  if (!detail || typeof detail !== "object") return null;
  const growId = (detail as { growId?: unknown }).growId;
  if (typeof growId !== "string") return null;
  const trimmed = growId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Whether active grow should change after save.
 * Sync when the saved grow is known and differs from the current active grow.
 */
export function shouldSyncActiveGrowAfterSave(input: {
  savedGrowId: string | null | undefined;
  currentActiveGrowId: string | null | undefined;
}): boolean {
  const saved = typeof input.savedGrowId === "string" ? input.savedGrowId.trim() : "";
  if (!saved) return false;
  const current =
    typeof input.currentActiveGrowId === "string" ? input.currentActiveGrowId.trim() : "";
  return saved !== current;
}

/** Timeline deep link for the grow that received the log. */
export function timelineHrefAfterQuickLogSave(growId: string | null | undefined): string | null {
  if (typeof growId !== "string" || !growId.trim()) return null;
  return logsPath(growId.trim());
}

/** Build a consistent entry-created detail payload. */
export function buildEntryCreatedScopeDetail(input: {
  growId?: string | null;
  plantId?: string | null;
  tentId?: string | null;
  createdAt?: string | null;
  growEventId?: string | null;
  source?: string | null;
}): EntryCreatedScopeDetail {
  const createdAt =
    typeof input.createdAt === "string" && input.createdAt.trim()
      ? input.createdAt.trim()
      : new Date().toISOString();
  return {
    createdAt,
    growId: typeof input.growId === "string" && input.growId.trim() ? input.growId.trim() : null,
    plantId:
      typeof input.plantId === "string" && input.plantId.trim() ? input.plantId.trim() : null,
    tentId: typeof input.tentId === "string" && input.tentId.trim() ? input.tentId.trim() : null,
    growEventId:
      typeof input.growEventId === "string" && input.growEventId.trim()
        ? input.growEventId.trim()
        : input.growEventId === null
          ? null
          : null,
    source: typeof input.source === "string" ? input.source : null,
  };
}
