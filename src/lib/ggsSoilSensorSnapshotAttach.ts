/**
 * ggsSoilSensorSnapshotAttach — pure adapter that turns the latest
 * validated GGS 3-in-1 Soil Sensor Pro reading for a given tent
 * (optionally plant-scoped) into a Quick Log snapshot draft.
 *
 * Hard constraints:
 *  - Pure. No I/O, no Supabase, no React, no fetch, no timers.
 *  - Read-only. Quick Log NEVER inserts sensor_readings; this helper
 *    only selects + presents an existing reading draft.
 *  - Never invents data. Stale or invalid GGS readings are returned
 *    with `attachable: false` and a clear reason; UI must surface
 *    the stale/invalid badge instead of presenting absent data as ok.
 *  - Never assumes a plant-specific reading unless `plantId` matches
 *    the draft's `plant_id` (or the draft has no plant scope and
 *    `plantId` is null, i.e. tent-level attach).
 *  - Preserves canonical source provenance for Timeline/Evidence Drawer
 *    badges (`live | manual | stale | invalid`).
 */
import type { GgsSoilReadingDraft } from "@/lib/ggsSoilSensorReadingNormalizer";

export type GgsSoilAttachBlockReason =
  | "no_reading"
  | "stale"
  | "invalid"
  | "tent_mismatch"
  | "plant_mismatch";

export interface GgsSoilSnapshotAttachDraft {
  attachable: boolean;
  blockedReason: GgsSoilAttachBlockReason | null;
  provider: GgsSoilReadingDraft["provider"];
  source: GgsSoilReadingDraft["source"];
  status: GgsSoilReadingDraft["status"];
  confidence: GgsSoilReadingDraft["confidence"];
  tent_id: string | null;
  plant_id: string | null;
  captured_at: string | null;
  readings: GgsSoilReadingDraft["readings"];
  warnings: string[];
  /** Short presenter-safe label for the attach button. */
  attachLabel: string;
}

export interface BuildGgsSoilSnapshotAttachOptions {
  /** Tent the Quick Log is scoped to. Required. */
  tentId: string;
  /** Plant the Quick Log is scoped to (null for tent-level attach). */
  plantId?: string | null;
}

const EMPTY_READINGS: GgsSoilReadingDraft["readings"] = {};

function block(
  reason: GgsSoilAttachBlockReason,
  base: Partial<GgsSoilSnapshotAttachDraft> = {},
): GgsSoilSnapshotAttachDraft {
  return {
    attachable: false,
    blockedReason: reason,
    provider: base.provider ?? "spider_farmer_ggs",
    source: base.source ?? "invalid",
    status: base.status ?? "invalid",
    confidence: base.confidence ?? "low",
    tent_id: base.tent_id ?? null,
    plant_id: base.plant_id ?? null,
    captured_at: base.captured_at ?? null,
    readings: base.readings ?? EMPTY_READINGS,
    warnings: base.warnings ?? [reason],
    attachLabel:
      reason === "no_reading"
        ? "No GGS soil reading"
        : reason === "stale"
          ? "Stale — cannot attach"
          : reason === "invalid"
            ? "Invalid — cannot attach"
            : "Wrong scope — cannot attach",
  };
}

/**
 * Build a Quick Log snapshot draft from a candidate GGS soil reading.
 * Caller supplies the latest reading already fetched/normalized.
 */
export function buildGgsSoilSnapshotAttachDraft(
  latest: GgsSoilReadingDraft | null | undefined,
  options: BuildGgsSoilSnapshotAttachOptions,
): GgsSoilSnapshotAttachDraft {
  if (!latest) return block("no_reading");

  if (!latest.tent_id || latest.tent_id !== options.tentId) {
    return block("tent_mismatch", { tent_id: latest.tent_id ?? null });
  }
  const requestedPlant = options.plantId ?? null;
  if (
    requestedPlant !== null &&
    latest.plant_id !== null &&
    latest.plant_id !== requestedPlant
  ) {
    return block("plant_mismatch", {
      tent_id: latest.tent_id,
      plant_id: latest.plant_id,
    });
  }

  if (latest.source === "invalid") {
    return block("invalid", {
      source: latest.source,
      status: latest.status,
      tent_id: latest.tent_id,
      plant_id: latest.plant_id,
      captured_at: latest.captured_at,
      warnings: latest.warnings,
    });
  }
  if (latest.source === "stale") {
    return block("stale", {
      source: latest.source,
      status: latest.status,
      tent_id: latest.tent_id,
      plant_id: latest.plant_id,
      captured_at: latest.captured_at,
      warnings: latest.warnings,
    });
  }

  return {
    attachable: true,
    blockedReason: null,
    provider: latest.provider,
    source: latest.source,
    status: latest.status,
    confidence: latest.confidence,
    tent_id: latest.tent_id,
    plant_id:
      requestedPlant !== null ? requestedPlant : latest.plant_id ?? null,
    captured_at: latest.captured_at,
    readings: latest.readings,
    warnings: latest.warnings,
    attachLabel:
      latest.source === "manual"
        ? "Attach manual GGS snapshot"
        : "Attach GGS soil snapshot",
  };
}
