/**
 * quickLogRevisionInvalidationRules — pure helpers that compute the React
 * Query keys to invalidate after a Quick Log correction or retraction
 * (issue #786).
 *
 * Pure, deterministic, null-safe. No React, no Supabase.
 *
 * A correction/retraction touches the same read surface as a diary-entry
 * removal (timeline, grouped timeline, memory, recent-activity caches), so
 * the removal key set is reused, extended with the revision ledger and
 * retracted-entries disclosure caches.
 */
import {
  buildDiaryRemovalInvalidationKeys,
  type QueryKey,
} from "@/lib/diaryEntryRemovalInvalidationRules";

export interface QuickLogRevisionMetadata {
  growEventId?: string | null;
  diaryEntryIds?: readonly string[] | null;
  plantId?: string | null;
  tentId?: string | null;
  growId?: string | null;
}

export function buildQuickLogRevisionInvalidationKeys(meta: QuickLogRevisionMetadata): QueryKey[] {
  const keys = buildDiaryRemovalInvalidationKeys({
    entryId: meta.diaryEntryIds?.[0] ?? meta.growEventId ?? "",
    plantId: meta.plantId ?? null,
    tentId: meta.tentId ?? null,
    growId: meta.growId ?? null,
  });
  keys.push(["quicklog_entry_revisions"]);
  keys.push(["quicklog_retracted_entries"]);
  // Sensor/readiness families from quickLogV2RefreshRules: these queries are
  // mounted on the same Plant Detail page and filter retracted_at, so a
  // revision must refresh them too (a retracted snapshot would otherwise
  // linger in freshness cards and AI Doctor readiness until an unrelated
  // refetch).
  keys.push(["plant_manual_sensor_history"]);
  keys.push(["plant_manual_sensor_logs"]);
  keys.push(["ai_doctor_context"]);
  keys.push(["ai_doctor_readiness"]);
  keys.push(["pheno_evidence_receipts"]);
  keys.push(["dashboard_memory"]);
  keys.push(["dashboard_recent_activity"]);
  keys.push(["tent_recent_activity"]);
  keys.push(["grow_events"]);
  return keys;
}
