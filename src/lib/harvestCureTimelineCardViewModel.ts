/**
 * harvestCureTimelineCardViewModel — pure view-model for rendering
 * harvest and cure_check entries on the timeline.
 *
 * Pure. No I/O, no Supabase, no React. Deterministic.
 *
 * Hard rules:
 *  - Sensor source labels come from `sensorSourceRules`. Manual/stale/
 *    demo/invalid snapshots NEVER render as "Live" and NEVER count as
 *    good evidence.
 *  - Mold-check "concern" returns caution state only — this view-model
 *    does not, and must not, emit alerts or Action Queue items.
 *  - Keeper status comes only from grower input — never inferred.
 */

import {
  QUICK_LOG_CURE_CHECK_EVENT_TYPE,
  QUICK_LOG_HARVEST_EVENT_TYPE,
  QUICK_LOG_HARVEST_CURE_LABELS,
  QUICK_LOG_HARVEST_RECORDED_NOTE,
  type QuickLogBurpedValue,
  type QuickLogKeeperStatus,
  type QuickLogMoldCheckStatus,
  type QuickLogTrimStyle,
} from "@/constants/quickLogEventTypes";
import {
  cureCheckCautionCopy,
  cureCheckCautionState,
  type CureCautionState,
} from "./harvestCureRules";
import type { GroveBagAirflowObservation } from "@/constants/groveBagCureFields";
import {
  buildGroveBagAirflowViewModel,
  type GroveBagAirflowViewModel,
} from "./groveBagAirflowRules";
import {
  isHealthySensorSource,
  normalizeSensorSource,
  sensorSourceLabel,
  type SensorSource,
} from "./sensor/sensorSourceRules";

export interface TimelineSensorSnapshotInput {
  source?: string | null;
  quality?: unknown;
  captured_at?: string | null;
  metrics?: Record<string, number | null | undefined> | null;
}

export interface HarvestCardViewModel {
  kind: "harvest";
  title: string;
  trim_style?: QuickLogTrimStyle;
  wet_weight_grams?: number;
  dry_weight_grams?: number;
  /**
   * Slice A3.1 — grower's ORIGINAL entered value + unit, when the entry
   * came in via Vocab A (value+unit). Timeline presenter can render
   * "2 lb (907.18 g)" honestly instead of implying the number was grams.
   * Absent for legacy grams-only rows.
   */
  original_wet_weight?: string;
  original_dry_weight?: string;
  original_weight_unit?: string;
  pheno_label?: string;
  keeper_candidate?: QuickLogKeeperStatus;
  quality_note?: string;
  harvest_stage_note?: string;
  trichome_note?: string;
  photoUrl?: string;
  sensor?: SensorCardViewModel;
  /** Always present; cautious memory-only copy. */
  memoryNote: string;
}

export interface CureCheckCardViewModel {
  kind: "cure_check";
  title: string;
  container_label?: string;
  cure_day?: number;
  jar_or_bag_rh?: number;
  cure_temp_f?: number;
  smell_note?: string;
  moisture_note?: string;
  mold_check?: QuickLogMoldCheckStatus;
  burped?: QuickLogBurpedValue;
  action_taken_note?: string;
  photoUrl?: string;
  sensor?: SensorCardViewModel;
  cautionState: CureCautionState;
  cautionCopy: string | null;
  /**
   * Optional Grove Bag airflow observation view-model. Present only when
   * the operator explicitly recorded an airflow value. Operator context
   * only — never inferred from telemetry.
   */
  airflow?: GroveBagAirflowViewModel;
}

export interface SensorCardViewModel {
  source: SensorSource;
  sourceLabel: string;
  /** False for everything except `live`. */
  isHealthyLive: boolean;
  /** True for demo/stale/invalid. Presenters must NOT treat as evidence. */
  isUnreliable: boolean;
  capturedAt: string | null;
  metrics: Record<string, number>;
}

export function buildSensorCardViewModel(
  snap: TimelineSensorSnapshotInput | null | undefined,
  now: number = Date.now(),
): SensorCardViewModel | undefined {
  if (!snap) return undefined;
  const source = normalizeSensorSource(snap.source);
  const metrics: Record<string, number> = {};
  if (snap.metrics) {
    for (const [k, v] of Object.entries(snap.metrics)) {
      if (typeof v === "number" && Number.isFinite(v)) metrics[k] = v;
    }
  }
  const capturedAtMs = snap.captured_at ? Date.parse(snap.captured_at) : Number.NaN;
  const ageMs = Number.isFinite(capturedAtMs) ? now - capturedAtMs : Number.NaN;
  const freshness =
    Number.isFinite(ageMs) && ageMs >= 0
      ? ageMs <= 30 * 60 * 1000
        ? "fresh"
        : "stale"
      : "unknown";
  const hasFaultEndpoint = Object.entries(metrics).some(
    ([key, value]) =>
      (key === "rh" ||
        key === "humidity_pct" ||
        key === "soil_moisture" ||
        key === "soil_moisture_pct") &&
      (value === 0 || value === 100),
  );
  const proof = {
    quality: hasFaultEndpoint ? "invalid" : snap.quality,
    freshness,
  };
  const isHealthyLive = isHealthySensorSource(source, proof);
  const isUnreliable =
    (source === "live" && !isHealthyLive) ||
    source === "demo" ||
    source === "stale" ||
    source === "invalid";
  return {
    source,
    sourceLabel: sensorSourceLabel(source, proof),
    isHealthyLive,
    isUnreliable,
    capturedAt: snap.captured_at ?? null,
    metrics,
  };
}

export interface HarvestCardInput {
  details: {
    harvest_stage_note?: string;
    trichome_note?: string;
    trim_style?: QuickLogTrimStyle;
    wet_weight_grams?: number;
    dry_weight_grams?: number;
    /** Slice A3.1 — passthrough of grower's original value+unit. */
    original_wet_weight?: string;
    original_dry_weight?: string;
    original_weight_unit?: string;
    quality_note?: string;
    pheno_label?: string;
    keeper_candidate?: QuickLogKeeperStatus;
  };
  photoUrl?: string | null;
  sensor?: TimelineSensorSnapshotInput | null;
}

export function buildHarvestCardViewModel(input: HarvestCardInput): HarvestCardViewModel {
  const d = input.details ?? {};
  return {
    kind: "harvest",
    title: QUICK_LOG_HARVEST_CURE_LABELS[QUICK_LOG_HARVEST_EVENT_TYPE],
    trim_style: d.trim_style,
    wet_weight_grams: d.wet_weight_grams,
    dry_weight_grams: d.dry_weight_grams,
    original_wet_weight: d.original_wet_weight,
    original_dry_weight: d.original_dry_weight,
    original_weight_unit: d.original_weight_unit,
    pheno_label: d.pheno_label,
    keeper_candidate: d.keeper_candidate,
    quality_note: d.quality_note,
    harvest_stage_note: d.harvest_stage_note,
    trichome_note: d.trichome_note,
    photoUrl: input.photoUrl ?? undefined,
    sensor: buildSensorCardViewModel(input.sensor),
    memoryNote: QUICK_LOG_HARVEST_RECORDED_NOTE,
  };
}

export interface CureCheckCardInput {
  details: {
    container_label?: string;
    cure_day?: number;
    jar_or_bag_rh?: number;
    cure_temp_f?: number;
    smell_note?: string;
    moisture_note?: string;
    mold_check?: QuickLogMoldCheckStatus;
    burped?: QuickLogBurpedValue;
    action_taken_note?: string;
    /** Optional Grove Bag airflow observation. */
    airflow_observation?: GroveBagAirflowObservation | string | null;
  };
  photoUrl?: string | null;
  sensor?: TimelineSensorSnapshotInput | null;
}

export function buildCureCheckCardViewModel(input: CureCheckCardInput): CureCheckCardViewModel {
  const d = input.details ?? {};
  const cautionState = cureCheckCautionState(d.mold_check);
  const hasAirflow =
    d.airflow_observation !== undefined &&
    d.airflow_observation !== null &&
    d.airflow_observation !== "";
  return {
    kind: "cure_check",
    title: QUICK_LOG_HARVEST_CURE_LABELS[QUICK_LOG_CURE_CHECK_EVENT_TYPE],
    container_label: d.container_label,
    cure_day: d.cure_day,
    jar_or_bag_rh: d.jar_or_bag_rh,
    cure_temp_f: d.cure_temp_f,
    smell_note: d.smell_note,
    moisture_note: d.moisture_note,
    mold_check: d.mold_check,
    burped: d.burped,
    action_taken_note: d.action_taken_note,
    photoUrl: input.photoUrl ?? undefined,
    sensor: buildSensorCardViewModel(input.sensor),
    cautionState,
    cautionCopy: cureCheckCautionCopy(cautionState),
    airflow: hasAirflow ? buildGroveBagAirflowViewModel(d.airflow_observation) : undefined,
  };
}
