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
  captured_at?: string | null;
  metrics?: Record<string, number | null | undefined> | null;
}

export interface HarvestCardViewModel {
  kind: "harvest";
  title: string;
  trim_style?: QuickLogTrimStyle;
  wet_weight_grams?: number;
  dry_weight_grams?: number;
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
): SensorCardViewModel | undefined {
  if (!snap) return undefined;
  const source = normalizeSensorSource(snap.source);
  const metrics: Record<string, number> = {};
  if (snap.metrics) {
    for (const [k, v] of Object.entries(snap.metrics)) {
      if (typeof v === "number" && Number.isFinite(v)) metrics[k] = v;
    }
  }
  const isHealthyLive = isHealthySensorSource(source);
  const isUnreliable = source === "demo" || source === "stale" || source === "invalid";
  return {
    source,
    sourceLabel: sensorSourceLabel(source),
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
    quality_note?: string;
    pheno_label?: string;
    keeper_candidate?: QuickLogKeeperStatus;
  };
  photoUrl?: string | null;
  sensor?: TimelineSensorSnapshotInput | null;
}

export function buildHarvestCardViewModel(
  input: HarvestCardInput,
): HarvestCardViewModel {
  const d = input.details ?? {};
  return {
    kind: "harvest",
    title: QUICK_LOG_HARVEST_CURE_LABELS[QUICK_LOG_HARVEST_EVENT_TYPE],
    trim_style: d.trim_style,
    wet_weight_grams: d.wet_weight_grams,
    dry_weight_grams: d.dry_weight_grams,
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
  };
  photoUrl?: string | null;
  sensor?: TimelineSensorSnapshotInput | null;
}

export function buildCureCheckCardViewModel(
  input: CureCheckCardInput,
): CureCheckCardViewModel {
  const d = input.details ?? {};
  const cautionState = cureCheckCautionState(d.mold_check);
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
  };
}
