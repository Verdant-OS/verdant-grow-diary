/**
 * quickLogV2RefreshRules — pure mapping from a resolved QuickLog v2 save
 * target to the React Query keys that must be invalidated so the newly
 * saved event appears across PlantDetail / TentDetail / Dashboard memory
 * surfaces without a page reload.
 *
 * Hard constraints:
 *  - Pure. No I/O, no React, no Supabase, no globals, no timers.
 *  - Returns query-key PREFIXES — react-query invalidates any cached
 *    query whose key starts with the prefix, so a save inside a tent
 *    refreshes both that tent's reads and the plant reads inside it.
 *  - Scope is taken from the user's selected target. Never derived from
 *    a "first/default" plant or tent.
 *  - Source-honest: no realtime-stream wording is used or emitted in any
 *    field, label, or key.
 *  - No alerts/action_queue/ai_doctor_sessions writes. No device control.
 *    No schema/RPC/write behavior changes.
 */

export type QuickLogV2RefreshTargetType = "plant" | "tent";

export interface QuickLogV2RefreshScope {
  targetType: QuickLogV2RefreshTargetType;
  targetId: string;
  /**
   * Resolved tent id for the target. For a tent target this equals
   * `targetId`. For a plant target this is the plant's assigned tent
   * (may be null if the plant is unassigned).
   */
  tentId: string | null;
}

export type QuickLogV2RefreshKey = readonly unknown[];

/**
 * Always-invalidated keys. These prefix-match the read-models that render
 * QuickLog memory across the app:
 *  - quick_log_grouped_timeline  → PlantDetail + TentDetail grouped section
 *  - timeline_memory             → PlantDetail + TentDetail timeline memory
 *  - manual_snapshot_timeline_cards → manual snapshot timeline section
 *  - diary_entries               → dashboards and panels reading diary rows
 *  - grow_events                 → any panel reading grow_events directly
 *  - timeline                    → legacy/generic timeline consumers
 */
const ALWAYS_KEYS: ReadonlyArray<QuickLogV2RefreshKey> = [
  ["quick_log_grouped_timeline"],
  ["timeline_memory"],
  ["manual_snapshot_timeline_cards"],
  ["diary_entries"],
  ["grow_events"],
  ["timeline"],
  // Dashboard recent activity / memory surfaces. Prefix-invalidation is a
  // no-op when no such query is mounted, so this safely refreshes the
  // dashboard if it exists without inventing a new system here.
  ["dashboard_recent_activity"],
  ["dashboard_memory"],
];

/**
 * Build the list of query-key prefixes to invalidate after a successful
 * QuickLog v2 save. Always returns a non-empty list; never returns keys
 * derived from an unrelated "default" plant/tent.
 */
export function buildQuickLogV2RefreshQueryKeys(
  scope: QuickLogV2RefreshScope,
): QuickLogV2RefreshKey[] {
  if (
    !scope ||
    (scope.targetType !== "plant" && scope.targetType !== "tent") ||
    typeof scope.targetId !== "string" ||
    scope.targetId.length === 0
  ) {
    // Defensive: still refresh broad memory queries so a misclassified
    // save can't leave a stale UI, but emit no plant/tent-specific keys.
    return ALWAYS_KEYS.map((k) => [...k]);
  }

  const keys: QuickLogV2RefreshKey[] = ALWAYS_KEYS.map((k) => [...k]);

  if (scope.targetType === "plant") {
    keys.push(["plant_recent_activity", scope.targetId]);
    keys.push(["plant_manual_sensor_history", scope.targetId]);
    keys.push(["plant_manual_sensor_logs", scope.targetId]);
    // AI Doctor readiness/context for this plant depends on timeline +
    // manual snapshot data. Invalidate explicitly so the readiness gate
    // re-evaluates after the save without a page reload. If the queries
    // are not mounted, react-query treats this as a safe no-op.
    keys.push(["ai_doctor_readiness", scope.targetId]);
    keys.push(["ai_doctor_context", scope.targetId]);
    // Plant-in-tent save: also nudge tent-scoped grouped timeline reads
    // so a TentDetail screen open in another route refreshes.
    if (typeof scope.tentId === "string" && scope.tentId.length > 0) {
      keys.push(["quick_log_grouped_timeline", scope.tentId]);
      keys.push(["tent_recent_activity", scope.tentId]);
    }
  } else {
    // Tent target: scope grouped timeline + recent activity to the tent.
    keys.push(["quick_log_grouped_timeline", scope.targetId]);
    keys.push(["tent_recent_activity", scope.targetId]);
  }

  return keys;
}
