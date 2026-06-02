/**
 * manualSensorSnapshotViewModel — pure presenter helpers that turn a
 * validated Manual Sensor Snapshot into a deterministic timeline card and
 * project a collection of snapshots into a plant or tent timeline.
 *
 * Hard constraints (tests + static safety):
 *  - Pure: no I/O, no Supabase, no React, no timers, no globals.
 *  - Source label is always "Manual sensor snapshot · Manual" — never
 *    "live", "synced", "imported", "persisted", or "connected".
 *  - Never invents readings; missing metrics stay missing.
 *  - Plant-linked snapshots filter into the plant timeline; tent-level
 *    snapshots filter into the tent timeline without requiring plant_id.
 */

import type {
  ManualSnapshotMetric,
  ManualSnapshotValidation,
} from "@/lib/manualSensorSnapshotRules";

export const MANUAL_SNAPSHOT_CARD_TITLE = "Manual sensor snapshot" as const;
export const MANUAL_SNAPSHOT_SOURCE_LABEL = "Manual" as const;

export interface ManualSnapshotRecord {
  id: string;
  capturedAt: string; // ISO-8601
  tentId: string;
  plantId: string | null;
  notes: string | null;
  validation: ManualSnapshotValidation;
}

export type ManualSnapshotCardSeverity = "ok" | "warning" | "invalid";

export interface ManualSnapshotTimelineReading {
  field: ManualSnapshotMetric["field"];
  value: number;
  unit: string;
  derived: boolean;
}

export interface ManualSnapshotTimelineCard {
  id: string;
  title: typeof MANUAL_SNAPSHOT_CARD_TITLE;
  capturedAt: string;
  /** Stable presenter label. Always "Manual". Never "live". */
  sourceLabel: typeof MANUAL_SNAPSHOT_SOURCE_LABEL;
  /** Always "manual". Mirrors the validation source. */
  source: "manual";
  tentId: string;
  plantId: string | null;
  /** True when plant_id is null — used by the tent/grow timeline. */
  isTentLevel: boolean;
  notes: string | null;
  readings: ManualSnapshotTimelineReading[];
  /** Worst-case state across validation. "invalid" only when errors exist. */
  severity: ManualSnapshotCardSeverity;
  warnings: string[];
  errors: string[];
}

const UNIT_BY_FIELD: Record<ManualSnapshotMetric["field"], string> = {
  air_temp_c: "°C",
  humidity_pct: "%",
  vpd_kpa: "kPa",
  co2_ppm: "ppm",
  soil_moisture_pct: "%",
  soil_temp_c: "°C",
  soil_ec_mscm: "mS/cm",
  reservoir_ph: "pH",
  reservoir_ec_mscm: "mS/cm",
  ppfd: "µmol",
};

function deriveSeverity(v: ManualSnapshotValidation): ManualSnapshotCardSeverity {
  if (v.errors.length > 0) return "invalid";
  if (v.warnings.length > 0) return "warning";
  return "ok";
}

/**
 * Pure presenter: build the timeline card for ONE manual snapshot.
 */
export function buildManualSnapshotTimelineCard(
  record: ManualSnapshotRecord,
): ManualSnapshotTimelineCard {
  const readings: ManualSnapshotTimelineReading[] = record.validation.metrics
    .map((m) => ({
      field: m.field,
      value: m.value,
      unit: UNIT_BY_FIELD[m.field],
      derived: m.derived === true,
    }))
    .sort((a, b) => a.field.localeCompare(b.field));

  return {
    id: record.id,
    title: MANUAL_SNAPSHOT_CARD_TITLE,
    capturedAt: record.capturedAt,
    sourceLabel: MANUAL_SNAPSHOT_SOURCE_LABEL,
    source: "manual",
    tentId: record.tentId,
    plantId: record.plantId,
    isTentLevel: record.plantId === null,
    notes: record.notes && record.notes.trim().length > 0 ? record.notes.trim() : null,
    readings,
    severity: deriveSeverity(record.validation),
    warnings: [...record.validation.warnings],
    errors: [...record.validation.errors],
  };
}

export interface SelectSnapshotsArgs {
  records: ReadonlyArray<ManualSnapshotRecord>;
  /** When provided, restrict to snapshots whose plant_id matches. */
  plantId?: string | null;
  /** When provided, restrict to snapshots whose tent_id matches. */
  tentId?: string | null;
  /** When true (default), include tent-level (plant_id null) cards in tent scope. */
  includeTentLevel?: boolean;
}

/**
 * Pure: project a list of manual snapshots into the correct timeline.
 *
 * Rules:
 *  - `plantId` set → only records with that exact plantId.
 *  - `tentId` set + no `plantId` → all records in that tent. Tent-level
 *    (plant_id null) records are included when `includeTentLevel` is true.
 *  - Output is sorted by capturedAt descending, then by id for stability.
 */
export function selectManualSnapshotsForTimeline(
  args: SelectSnapshotsArgs,
): ManualSnapshotTimelineCard[] {
  const includeTentLevel = args.includeTentLevel ?? true;
  const filtered = args.records.filter((r) => {
    if (args.plantId !== undefined && args.plantId !== null) {
      return r.plantId === args.plantId;
    }
    if (args.tentId !== undefined && args.tentId !== null) {
      if (r.tentId !== args.tentId) return false;
      if (!includeTentLevel && r.plantId === null) return false;
      return true;
    }
    return true;
  });

  const cards = filtered.map(buildManualSnapshotTimelineCard);
  cards.sort((a, b) => {
    if (a.capturedAt > b.capturedAt) return -1;
    if (a.capturedAt < b.capturedAt) return 1;
    return a.id.localeCompare(b.id);
  });
  return cards;
}
