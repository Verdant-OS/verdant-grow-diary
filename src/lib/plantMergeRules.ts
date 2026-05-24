/**
 * Pure helpers for the duplicate-plant Merge workflow.
 *
 * v2: the server-side RPC `public.merge_duplicate_plant(uuid, uuid)`
 * exists and is the *only* execution path. The client never updates
 * grow_events / diary_entries / alerts / action_queue directly.
 *
 *   - Detects likely-duplicate candidates within the same grow.
 *   - Builds a merge preview describing what would move and what is
 *     skipped (sensor readings stay tent-scoped, pi-ingest stays
 *     bridge-scoped).
 *   - Never hard-deletes the source plant.
 *   - Never deletes diary entries, photos, watering/feeding/observation
 *     events, sensor readings, alerts, action queue items, or tasks.
 *   - Cross-grow merges are disallowed by default. Caller may explicitly
 *     opt in with `allowCrossGrow: true`; the RPC itself rejects them.
 *
 * Out of scope: alerts persistence, Action Queue behavior, sensors,
 * automation, device control. No React, no Supabase, no I/O — safe to
 * unit-test in isolation.
 */

export interface PlantForMerge {
  id: string;
  name: string;
  strain?: string | null;
  grow_id?: string | null;
  tent_id?: string | null;
  started_at?: string | null;
  is_archived?: boolean | null;
}

export interface PlantLinkedCounts {
  diaryEntries?: number;
  growEvents?: number;
  photoEvents?: number;
  wateringEvents?: number;
  feedingEvents?: number;
  observationEvents?: number;
  trainingEvents?: number;
  sensorReadings?: number;
  alerts?: number;
  actionQueueItems?: number;
  dailyGrowChecks?: number;
}

export interface MergePreviewLine {
  /** Stable key for the data type (e.g. "diary_entries"). */
  key: string;
  /** Grower-facing label, e.g. "Diary entries / Quick Logs". */
  label: string;
  /** Count of rows referencing the source plant. May be 0. */
  sourceCount: number;
  /**
   * Whether the safe server-side RPC will move this data type as part
   * of the same transaction. Subtype event tables (watering/feeding/
   * training/observation/environment/photo) follow `grow_events` via
   * `event_id` and are reassigned transitively.
   */
  mergeable: boolean;
  /** Optional reason shown in the UI when `mergeable` is false. */
  blockedReason?: string;
}

export interface PlantMergePreview {
  source: PlantForMerge;
  target: PlantForMerge;
  sameGrow: boolean;
  lines: MergePreviewLine[];
  warnings: string[];
  blockers: string[];
  /** True when no executable step exists (e.g. blocked or zero history). */
  previewOnly: boolean;
  recommendedAction:
    | "preview_only"
    | "archive_source_after_review"
    | "execute_via_rpc"
    | "blocked";
}

export interface PlantMergeValidation {
  ok: boolean;
  reason?: string;
}

const DATA_LINES: ReadonlyArray<{
  key: keyof PlantLinkedCounts;
  label: string;
  mergeable: boolean;
  blockedReason?: string;
}> = [
  {
    key: "diaryEntries",
    label: "Diary entries / Quick Logs",
    mergeable: true,
  },
  {
    key: "growEvents",
    label: "Grow events",
    mergeable: true,
  },
  {
    key: "photoEvents",
    label: "Photos",
    mergeable: true,
  },
  {
    key: "wateringEvents",
    label: "Watering events",
    mergeable: true,
  },
  {
    key: "feedingEvents",
    label: "Feeding events",
    mergeable: true,
  },
  {
    key: "observationEvents",
    label: "Observations",
    mergeable: true,
  },
  {
    key: "trainingEvents",
    label: "Training events",
    mergeable: true,
  },
  {
    key: "sensorReadings",
    label: "Sensor readings (plant-linked)",
    mergeable: false,
    blockedReason:
      "Sensor readings are tent-scoped and stay with the tent — they are not moved by a plant merge.",
  },
  {
    key: "alerts",
    label: "Alerts",
    mergeable: true,
  },
  {
    key: "actionQueueItems",
    label: "Action Queue items",
    mergeable: true,
  },
  {
    key: "dailyGrowChecks",
    label: "Daily Grow Check history",
    mergeable: true,
  },
];

export function validatePlantMerge(
  source: PlantForMerge,
  target: PlantForMerge | null | undefined,
  opts: { allowCrossGrow?: boolean } = {},
): PlantMergeValidation {
  if (source.is_archived) {
    return { ok: false, reason: "This plant is already archived or merged." };
  }
  if (!target) return { ok: false, reason: "Pick a target plant to keep." };
  if (source.id === target.id) {
    return { ok: false, reason: "Cannot merge a plant into itself." };
  }
  if (target.is_archived) {
    return { ok: false, reason: "Target plant is archived." };
  }
  const sameGrow =
    source.grow_id != null &&
    target.grow_id != null &&
    source.grow_id === target.grow_id;
  if (!sameGrow && !opts.allowCrossGrow) {
    return {
      ok: false,
      reason: "Cross-grow merges are disabled. Pick a target plant in the same grow.",
    };
  }
  return { ok: true };
}

/**
 * Lightweight duplicate detector. Same grow only. Returns groups of likely
 * duplicates so the UI can surface a "you may have duplicates" hint without
 * ever auto-merging.
 */
export function detectPotentialDuplicatePlants(
  plants: readonly PlantForMerge[],
): PlantForMerge[][] {
  const buckets = new Map<string, PlantForMerge[]>();
  for (const p of plants) {
    if (p.is_archived) continue;
    if (!p.grow_id) continue;
    const strain = (p.strain ?? "").trim().toLowerCase();
    const nameStem = normalizeNameStem(p.name);
    const key = `${p.grow_id}|${strain}|${nameStem}`;
    const arr = buckets.get(key) ?? [];
    arr.push(p);
    buckets.set(key, arr);
  }
  const groups: PlantForMerge[][] = [];
  for (const arr of buckets.values()) {
    if (arr.length >= 2) groups.push(arr);
  }
  return groups;
}

function normalizeNameStem(name: string): string {
  return name
    .toLowerCase()
    .replace(/[#_-]/g, " ")
    .replace(/\b\d+\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildPlantMergePreview(
  source: PlantForMerge,
  target: PlantForMerge,
  counts: PlantLinkedCounts = {},
  opts: { allowCrossGrow?: boolean } = {},
): PlantMergePreview {
  const sameGrow =
    source.grow_id != null &&
    target.grow_id != null &&
    source.grow_id === target.grow_id;
  const warnings: string[] = [];
  const blockers: string[] = [];

  if (!sameGrow) {
    if (opts.allowCrossGrow) {
      warnings.push(
        "Cross-grow merge: source and target belong to different grows. Proceed with caution.",
      );
    } else {
      blockers.push("Cross-grow merges are disabled. Pick a target plant in the same grow.");
    }
  }

  const lines: MergePreviewLine[] = DATA_LINES.map((def) => ({
    key: def.key,
    label: def.label,
    sourceCount: Number(counts[def.key] ?? 0) || 0,
    mergeable: def.mergeable,
    blockedReason: def.blockedReason,
  }));

  const anyData = lines.some((l) => l.sourceCount > 0);
  const anyExecutable = lines.some((l) => l.mergeable && l.sourceCount > 0);

  let recommendedAction: PlantMergePreview["recommendedAction"] = "preview_only";
  if (blockers.length > 0) recommendedAction = "blocked";
  else if (!anyData) recommendedAction = "archive_source_after_review";
  else if (anyExecutable) recommendedAction = "execute_via_rpc";

  const previewOnly = recommendedAction !== "execute_via_rpc";

  return {
    source,
    target,
    sameGrow,
    lines,
    warnings,
    blockers,
    previewOnly,
    recommendedAction,
  };
}

export function summarizePlantMergePlan(preview: PlantMergePreview): string {
  const totals = preview.lines.reduce((acc, l) => acc + l.sourceCount, 0);
  if (preview.recommendedAction === "blocked") {
    return preview.blockers.join(" ");
  }
  if (totals === 0) {
    return `No history on "${preview.source.name}". Safe to archive it as a duplicate of "${preview.target.name}".`;
  }
  return `"${preview.source.name}" has ${totals} linked record(s) that will move to "${preview.target.name}" in a single server-side transaction. Sensor readings stay tent-scoped and are not moved.`;
}

/**
 * Build the update plan. With the server-side RPC available, the safe
 * tables (grow_events, diary_entries, alerts, action_queue) are
 * reassigned via `merge_duplicate_plant`. Subtype event tables follow
 * `grow_events` via `event_id` transitively. The client never updates
 * any of these tables directly.
 */
export interface PlantMergeUpdatePlan {
  sourcePlantId: string;
  targetPlantId: string;
  steps: Array<{ table: string; via: "rpc"; enabled: boolean }>;
  executable: boolean;
  rpcName: "merge_duplicate_plant";
  blockedReason?: string;
}

export function buildPlantMergeUpdatePlan(
  sourcePlantId: string,
  targetPlantId: string,
): PlantMergeUpdatePlan {
  return {
    sourcePlantId,
    targetPlantId,
    steps: [
      { table: "grow_events", via: "rpc", enabled: true },
      { table: "diary_entries", via: "rpc", enabled: true },
      { table: "alerts", via: "rpc", enabled: true },
      { table: "action_queue", via: "rpc", enabled: true },
    ],
    executable: true,
    rpcName: "merge_duplicate_plant",
  };
}

// ---------------------------------------------------------------------------
// RPC return-summary + error mapping
// ---------------------------------------------------------------------------

export interface MergeRpcMovedSummary {
  grow_events: number;
  diary_entries: number;
  alerts: number;
  action_queue: number;
}

export interface MergeRpcSummary {
  source_plant_id: string;
  target_plant_id: string;
  moved: MergeRpcMovedSummary;
  skipped?: Record<string, boolean>;
  source_status?: string;
  audit_logged?: boolean;
}

export function parseMergeRpcSummary(raw: unknown): MergeRpcSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const moved = (r.moved ?? {}) as Record<string, unknown>;
  const toInt = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  if (typeof r.source_plant_id !== "string" || typeof r.target_plant_id !== "string") {
    return null;
  }
  return {
    source_plant_id: r.source_plant_id,
    target_plant_id: r.target_plant_id,
    moved: {
      grow_events: toInt(moved.grow_events),
      diary_entries: toInt(moved.diary_entries),
      alerts: toInt(moved.alerts),
      action_queue: toInt(moved.action_queue),
    },
    skipped: (r.skipped as Record<string, boolean> | undefined) ?? undefined,
    source_status: typeof r.source_status === "string" ? r.source_status : undefined,
    audit_logged: typeof r.audit_logged === "boolean" ? r.audit_logged : undefined,
  };
}

export type MergeRpcErrorKind =
  | "plant_already_merged"
  | "same_source_target"
  | "cross_grow_merge_blocked"
  | "ownership_or_not_found"
  | "not_authenticated"
  | "generic";

export interface MergeRpcErrorMapping {
  kind: MergeRpcErrorKind;
  message: string;
}

/**
 * Map a Postgres / supabase-js error from the RPC into a friendly UI
 * message + stable kind. Inspects code + message text.
 */
export function mapMergeRpcError(err: unknown): MergeRpcErrorMapping {
  const e = (err ?? {}) as { code?: string; message?: string };
  const msg = (e.message ?? "").toLowerCase();

  if (msg.includes("plant_already_merged")) {
    return {
      kind: "plant_already_merged",
      message: "This plant has already been merged or archived.",
    };
  }
  if (msg.includes("must differ")) {
    return {
      kind: "same_source_target",
      message: "Choose a different target plant.",
    };
  }
  if (msg.includes("cross-grow")) {
    return {
      kind: "cross_grow_merge_blocked",
      message: "Plants must be in the same grow to merge.",
    };
  }
  if (e.code === "42501" || msg.includes("not found or not owned")) {
    return {
      kind: "ownership_or_not_found",
      message:
        "Plant could not be merged. Check that both plants still exist and belong to this grow.",
    };
  }
  if (e.code === "28000" || msg.includes("not authenticated")) {
    return {
      kind: "not_authenticated",
      message: "Please sign in again and retry.",
    };
  }
  return {
    kind: "generic",
    message: "Merge failed. No data was moved.",
  };
}
