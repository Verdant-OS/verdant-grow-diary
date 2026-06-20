import type { PlantRecentActivityRow } from "@/lib/plantRecentActivityRules";
import {
  evaluateStabilizeMode,
  type StabilizeModeResult,
} from "@/lib/stabilizeModeRules";

const HOUR_MS = 60 * 60 * 1000;
const WINDOW_HOURS = 48;

const ACTION_EVENT_TYPES = [
  "quick_log",
  "watering",
  "water",
  "feeding",
  "feed",
  "training",
  "pruning",
  "defoliation",
  "transplant",
  "flush",
  "environment",
  "light",
] as const;

const ACTION_NOTE_KEYWORDS = [
  "quick check:",
  "watered",
  "watering",
  "fed",
  "feeding",
  "flush",
  "flushed",
  "prune",
  "pruned",
  "defoliate",
  "defoliated",
  "trained",
  "training",
  "transplant",
  "transplanted",
  "raised light",
  "lowered light",
  "changed light",
  "moved light",
  "changed vpd",
  "changed humidity",
  "changed temp",
] as const;

const MAJOR_EVENT_TYPES = [
  "training",
  "pruning",
  "defoliation",
  "transplant",
  "flush",
  "environment",
  "light",
] as const;

const MAJOR_NOTE_KEYWORDS = [
  "flush",
  "flushed",
  "prune",
  "pruned",
  "defoliate",
  "defoliated",
  "trained",
  "training",
  "transplant",
  "transplanted",
  "raised light",
  "lowered light",
  "changed light",
  "moved light",
  "changed vpd",
  "changed humidity",
  "changed temp",
] as const;

export interface PlantStabilizeModeInput {
  rows: readonly PlantRecentActivityRow[] | null | undefined;
  now: string | number | Date;
  plantStage?: string | null;
  plantStatus?: string | null;
}

function toMs(value: string | number | Date | null | undefined): number | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

function includesAny(haystack: string, needles: readonly string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some((needle) => lower.includes(needle));
}

function inWindow(row: PlantRecentActivityRow, nowMs: number): boolean {
  const t = toMs(row.occurredAt);
  if (t === null) return false;
  const age = nowMs - t;
  return age >= 0 && age <= WINDOW_HOURS * HOUR_MS;
}

function isAction(row: PlantRecentActivityRow): boolean {
  const eventType = row.eventType.toLowerCase();
  return (
    ACTION_EVENT_TYPES.some((type) => eventType.includes(type)) ||
    includesAny(row.notePreview, ACTION_NOTE_KEYWORDS)
  );
}

function isMajor(row: PlantRecentActivityRow): boolean {
  const eventType = row.eventType.toLowerCase();
  return (
    MAJOR_EVENT_TYPES.some((type) => eventType.includes(type)) ||
    includesAny(row.notePreview, MAJOR_NOTE_KEYWORDS)
  );
}

function latestOccurredAt(rows: readonly PlantRecentActivityRow[]): string | null {
  let latest: { iso: string; ms: number } | null = null;
  for (const row of rows) {
    const t = toMs(row.occurredAt);
    if (t === null || !row.occurredAt) continue;
    if (latest === null || t > latest.ms) latest = { iso: row.occurredAt, ms: t };
  }
  return latest?.iso ?? null;
}

export function buildPlantStabilizeModeViewModel(
  input: PlantStabilizeModeInput,
): StabilizeModeResult {
  const nowMs = toMs(input.now);
  const rows = input.rows ?? [];
  if (nowMs === null) {
    return evaluateStabilizeMode({
      now: 0,
      plant_stage: input.plantStage ?? null,
      plant_status: input.plantStatus ?? null,
      last_log_at: null,
      recent_action_count_48h: 0,
      recent_major_change_count_48h: 0,
      active_alert_count: 0,
      sensor_source_summary: "live",
      has_stale_or_invalid_sensor_data: false,
      has_demo_or_manual_only_sensor_data: false,
      ai_doctor_confidence_level: "high",
      ai_doctor_missing_info_count: 0,
    });
  }

  const recent = rows.filter((row) => inWindow(row, nowMs));
  const recentActionCount = recent.filter(isAction).length;
  const recentMajorChangeCount = recent.filter(isMajor).length;
  const hasWarnings = recent.some((row) => row.warnings.length > 0);

  return evaluateStabilizeMode({
    now: input.now,
    plant_stage: input.plantStage ?? null,
    plant_status: input.plantStatus ?? null,
    last_log_at: latestOccurredAt(rows),
    recent_action_count_48h: recentActionCount,
    recent_major_change_count_48h: recentMajorChangeCount,
    active_alert_count: hasWarnings ? 1 : 0,
    sensor_source_summary: "live",
    has_stale_or_invalid_sensor_data: false,
    has_demo_or_manual_only_sensor_data: false,
    ai_doctor_confidence_level: "high",
    ai_doctor_missing_info_count: 0,
  });
}

export function shouldShowPlantStabilizeMode(result: StabilizeModeResult): boolean {
  return result.level === "stabilize" || result.level === "urgent_review";
}
