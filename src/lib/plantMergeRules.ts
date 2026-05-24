/**
 * Pure helpers for the duplicate-plant Merge workflow.
 *
 * Strategy: PREVIEW-ONLY at v1.
 *   - Detects likely-duplicate candidates within the same grow.
 *   - Builds a merge preview describing what would move, what is blocked,
 *     and which data types require a server-side transaction/RPC before a
 *     safe execution path can be added.
 *   - Never hard-deletes the source plant.
 *   - Never deletes diary entries, photos, watering/feeding/observation
 *     events, sensor readings, alerts, action queue items, or tasks.
 *   - Cross-grow merges are disallowed by default. Caller may explicitly
 *     opt in with `allowCrossGrow: true`, which is still surfaced as a
 *     warning in the preview.
 *
 * Out of scope: alerts, Action Queue, sensors, automation, device control.
 * No React, no Supabase, no I/O — safe to unit-test in isolation.
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
   * Whether v1 can move this data type today via plant_id update only.
   * Tables joined indirectly (via event_id) are flagged as blocked because
   * a multi-table transaction/RPC would be required to keep things safe.
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
  /** True when no v1 execution path exists for any non-zero data type. */
  previewOnly: boolean;
  recommendedAction:
    | "preview_only"
    | "archive_source_after_review"
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
    mergeable: false,
    blockedReason:
      "Needs a safe transaction/RPC to repoint diary_entries.plant_id without losing history.",
  },
  {
    key: "growEvents",
    label: "Grow events",
    mergeable: false,
    blockedReason:
      "Needs a safe transaction/RPC to repoint grow_events.plant_id without losing history.",
  },
  {
    key: "photoEvents",
    label: "Photos",
    mergeable: false,
    blockedReason: "Photo events join via event_id; safe RPC required.",
  },
  {
    key: "wateringEvents",
    label: "Watering events",
    mergeable: false,
    blockedReason: "Watering events join via event_id; safe RPC required.",
  },
  {
    key: "feedingEvents",
    label: "Feeding events",
    mergeable: false,
    blockedReason: "Feeding events join via event_id; safe RPC required.",
  },
  {
    key: "observationEvents",
    label: "Observations",
    mergeable: false,
    blockedReason: "Observation events join via event_id; safe RPC required.",
  },
  {
    key: "trainingEvents",
    label: "Training events",
    mergeable: false,
    blockedReason: "Training events join via event_id; safe RPC required.",
  },
  {
    key: "sensorReadings",
    label: "Sensor readings (plant-linked)",
    mergeable: false,
    blockedReason: "Sensor readings are tent-scoped; do not move with a plant merge.",
  },
  {
    key: "alerts",
    label: "Alerts",
    mergeable: false,
    blockedReason: "Alert persistence is out of scope for this workflow.",
  },
  {
    key: "actionQueueItems",
    label: "Action Queue items",
    mergeable: false,
    blockedReason: "Action Queue is out of scope for this workflow.",
  },
  {
    key: "dailyGrowChecks",
    label: "Daily Grow Check history",
    mergeable: false,
    blockedReason: "Tracked via diary_entries; covered by the same safe RPC requirement.",
  },
];

export function validatePlantMerge(
  source: PlantForMerge,
  target: PlantForMerge | null | undefined,
  opts: { allowCrossGrow?: boolean } = {},
): PlantMergeValidation {
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
  const previewOnly = !anyExecutable;

  let recommendedAction: PlantMergePreview["recommendedAction"] = "preview_only";
  if (blockers.length > 0) recommendedAction = "blocked";
  else if (!anyData) recommendedAction = "archive_source_after_review";

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
  const blockedTypes = preview.lines.filter(
    (l) => !l.mergeable && l.sourceCount > 0,
  ).length;
  if (preview.recommendedAction === "blocked") {
    return preview.blockers.join(" ");
  }
  if (totals === 0) {
    return `No history on "${preview.source.name}". Safe to archive it as a duplicate of "${preview.target.name}".`;
  }
  return `"${preview.source.name}" has ${totals} linked record(s) across ${blockedTypes} data type(s) that need a safe server-side transaction before they can move to "${preview.target.name}". Preview-only at this stage.`;
}

/**
 * Build the (currently empty) update plan. Returned shape is stable so a
 * future RPC integration can fill it in without changing call sites.
 */
export interface PlantMergeUpdatePlan {
  sourcePlantId: string;
  targetPlantId: string;
  /** Tables this plan would update if execution were enabled. */
  steps: Array<{ table: string; via: "plant_id" | "rpc"; enabled: boolean }>;
  executable: boolean;
  blockedReason: string;
}

export function buildPlantMergeUpdatePlan(
  sourcePlantId: string,
  targetPlantId: string,
): PlantMergeUpdatePlan {
  return {
    sourcePlantId,
    targetPlantId,
    steps: [
      { table: "diary_entries", via: "rpc", enabled: false },
      { table: "grow_events", via: "rpc", enabled: false },
    ],
    executable: false,
    blockedReason:
      "Merge execution needs a safe transaction/RPC before moving data. Preview-only.",
  };
}
