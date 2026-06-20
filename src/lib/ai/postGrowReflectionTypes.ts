export type ReflectionConfidence = "Low" | "Medium" | "High";

export type GrowType = "photoperiod" | "autoflower" | string;

export type SensorSourceTag = "live" | "manual" | "csv" | "demo" | "stale" | "invalid";

export interface SensorAggregateMetric {
  metric: string;
  unit: string;
  count: number;
  average: number | null;
  min: number | null;
  max: number | null;
  variance: number | null;
  percent_in_target: number | null;
  target_band: string | null;
  notable_excursions: Array<{
    occurred_at: string;
    value: number;
    note: string;
    linked_event_id?: string | null;
  }>;
}

export interface StageReflectionData {
  stage: string;
  start_date?: string | null;
  end_date?: string | null;
  sensor_coverage_pct: number | null;
  metrics: SensorAggregateMetric[];
  notes?: string[];
}

export interface GrowReflectionEvent {
  id: string;
  type:
    | "watering"
    | "feeding"
    | "training"
    | "observation"
    | "photo"
    | "harvest"
    | "dry_checkpoint"
    | "cure_burp"
    | "final_yield_assessment"
    | string;
  occurred_at: string;
  plant_id?: string | null;
  plant_label?: string | null;
  summary: string;
  evidence?: Record<string, string | number | boolean | null>;
}

export interface WateringFeedingSummary {
  watering_event_count: number;
  feeding_event_count: number;
  consistency_notes: string[];
  known_gaps: string[];
}

export interface PhotoSummary {
  photo_count: number;
  key_observations: string[];
  known_gaps: string[];
}

export interface QualityScores {
  overall?: number | null;
  aroma?: number | null;
  smoothness?: number | null;
  flavor?: number | null;
  structure?: number | null;
  notes?: string | null;
}

export interface WeightLossPoint {
  day: number;
  date: string;
  weight_grams: number;
  loss_pct_from_previous?: number | null;
  loss_pct_from_harvest_start?: number | null;
}

export interface CureRhPoint {
  date: string;
  jar_rh_pct: number;
  smell_note?: string | null;
  burped?: boolean | null;
}

export interface PostHarvestOutcomes {
  harvest_weight_grams?: number | null;
  final_dry_yield_grams?: number | null;
  weight_loss_curve: WeightLossPoint[];
  cure_rh_curve: CureRhPoint[];
  final_jar_rh_pct?: number | null;
  smell_progression_notes: string[];
  flags_resolved: string[];
}

export interface GrowContext {
  grow_id: string;
  name: string;
  strain?: string | null;
  phenos?: Array<{ plant_id: string; label: string; notes?: string | null }>;
  grow_type: GrowType;
  start_date: string;
  end_date?: string | null;
  final_stage?: string | null;
  sensor_coverage_pct: number;
  source_tags: SensorSourceTag[];
  stages: Record<string, StageReflectionData>;
  events: GrowReflectionEvent[];
  watering_feeding_summary?: WateringFeedingSummary;
  photo_summary?: PhotoSummary;
  quality_scores?: QualityScores;
  post_harvest_outcomes?: PostHarvestOutcomes;
  user_notes?: string | null;
  previous_user_lessons?: string[];
  known_gaps: string[];
}

export interface ReflectionOutput {
  executive_reflection: string;
  key_wins: string[];
  repeat_next_run: string[];
  adjust_or_avoid: string[];
  post_harvest_specific_insights: string[];
  pheno_strain_notes: string[];
  low_risk_experiments: string[];
  confidence: ReflectionConfidence;
  gaps: string[];
}
