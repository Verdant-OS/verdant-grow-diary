/**
 * growReportEnvironmentCheckViewModel — pure helper that aggregates a
 * separate "Environment Checks" section for the Grow Report.
 *
 * Hard constraints:
 *   - Pure. No I/O, no React, no Supabase, no Action Queue, no AI.
 *   - Reads only from existing diary/log history (no new persistence).
 *   - Environment Check values are NEVER merged into sensor averages.
 *   - Environment Check values are NEVER used for health scoring.
 *   - Never labels Environment Check data as live.
 *   - Never classified as `sensor_readings` rows.
 *   - Never throws on malformed input.
 */
import {
  buildEnvironmentCheckTimelineList,
  type EnvironmentCheckTimelineField,
  type EnvironmentCheckTimelineRawEntry,
} from "./environmentCheckTimelineViewModel";

export const GROW_REPORT_ENVIRONMENT_CHECKS_TITLE =
  "Environment Checks" as const;

export const GROW_REPORT_ENVIRONMENT_CHECKS_DISCLAIMER =
  "Environment Checks are grower-entered Quick Log notes, not canonical sensor readings." as const;

export const GROW_REPORT_ENVIRONMENT_CHECKS_EMPTY =
  "No environment checks logged for this grow report period." as const;

export interface GrowReportEnvironmentCheckRow {
  entryId: string;
  occurredAt: string;
  dateKey: string;
  plantName: string | null;
  tentName: string | null;
  fields: EnvironmentCheckTimelineField[];
  noteSummary: string | null;
  /** Always false — Environment Check is never a sensor_readings row. */
  isSensorReading: false;
  /** Always true — never label as live telemetry. */
  notLive: true;
}

export interface GrowReportEnvironmentCheckSection {
  title: typeof GROW_REPORT_ENVIRONMENT_CHECKS_TITLE;
  disclaimer: typeof GROW_REPORT_ENVIRONMENT_CHECKS_DISCLAIMER;
  /** Never merged into sensor averages (always false). */
  mergedIntoSensorAverages: false;
  /** Never used for health scoring (always false). */
  usedForHealthScoring: false;
  rows: GrowReportEnvironmentCheckRow[];
  totalCount: number;
  emptyState: string | null;
}

function pickPlantName(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const v = (details as Record<string, unknown>).plant_name;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? (t.length > 80 ? t.slice(0, 80) : t) : null;
}

function pickTentName(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const v = (details as Record<string, unknown>).tent_name;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? (t.length > 80 ? t.slice(0, 80) : t) : null;
}

export function buildGrowReportEnvironmentCheckSection(
  rawEntries:
    | readonly EnvironmentCheckTimelineRawEntry[]
    | null
    | undefined,
): GrowReportEnvironmentCheckSection {
  const list = buildEnvironmentCheckTimelineList(rawEntries);
  // Index raw entries by id for plant/tent context lookup (presenter-safe).
  const rawById = new Map<string, EnvironmentCheckTimelineRawEntry>();
  if (Array.isArray(rawEntries)) {
    for (const r of rawEntries) {
      if (r && typeof r === "object" && typeof r.id === "string") {
        rawById.set(r.id, r);
      }
    }
  }

  const rows: GrowReportEnvironmentCheckRow[] = list.map((vm) => {
    const raw = rawById.get(vm.entryId) ?? null;
    return {
      entryId: vm.entryId,
      occurredAt: vm.occurredAt,
      dateKey: vm.dateKey,
      plantName: pickPlantName(raw?.details),
      tentName: pickTentName(raw?.details),
      fields: vm.fields.slice(),
      noteSummary: vm.noteSummary,
      isSensorReading: false,
      notLive: true,
    };
  });

  return {
    title: GROW_REPORT_ENVIRONMENT_CHECKS_TITLE,
    disclaimer: GROW_REPORT_ENVIRONMENT_CHECKS_DISCLAIMER,
    mergedIntoSensorAverages: false,
    usedForHealthScoring: false,
    rows,
    totalCount: rows.length,
    emptyState: rows.length === 0 ? GROW_REPORT_ENVIRONMENT_CHECKS_EMPTY : null,
  };
}
