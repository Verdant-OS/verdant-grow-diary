/**
 * Timeline header stage and "day N".
 *
 * The header used to read the grow row only, so a Flower plant in a grow
 * (or tent) still marked Veg read "Vegetative · day 92". When the Timeline
 * is scoped to a plant or tent, that record describes what the grower is
 * looking at, so it wins:
 *
 *  - Stage: plant > tent > grow. A missing, blank or whitespace stage falls
 *    through to the next record.
 *  - Day: the plant's start date when the plant has one, else the grow start.
 *    Plant starts are the calendar date the grower picked (UTC midnight is
 *    that date, see `resolvePlantStartCalendarDate`); grow starts are
 *    timestamptz instants read in local days (`resolveTimelineGrowDay`).
 *    A future or unreadable plant start yields no day rather than borrowing
 *    the grow's, so the header never shows a day for the wrong record.
 *
 * Pure: no React, no Supabase. `now` is injected.
 */
import {
  calendarDaysBetween,
  localCalendarDate,
  resolvePlantStartCalendarDate,
  resolveTimelineGrowDay,
} from "@/lib/plantStartDateRules";

export interface TimelineHeaderStageInput {
  plant?: { stage?: string | null; started_at?: string | null } | null;
  tent?: { stage?: string | null } | null;
  grow?: { stage?: string | null; started_at?: string | null } | null;
}

export type TimelineHeaderStageSource = "plant" | "tent" | "grow" | "none";
export type TimelineHeaderStartSource = "plant" | "grow" | "none";

export interface TimelineHeaderStage {
  stage: string | null;
  stageSource: TimelineHeaderStageSource;
  startedAt: string | null;
  startedAtSource: TimelineHeaderStartSource;
  day: number | null;
}

function present(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function plantStartDay(iso: string, now: Date): number | null {
  const start = resolvePlantStartCalendarDate(iso);
  if (!start) return null;
  const days = calendarDaysBetween(start, localCalendarDate(now));
  return days < 0 ? null : days;
}

export function resolveTimelineHeaderStage(
  input: TimelineHeaderStageInput,
  now: Date,
): TimelineHeaderStage {
  const plantStage = present(input.plant?.stage);
  const tentStage = present(input.tent?.stage);
  const growStage = present(input.grow?.stage);

  let stage: string | null = null;
  let stageSource: TimelineHeaderStageSource = "none";
  if (plantStage) {
    stage = plantStage;
    stageSource = "plant";
  } else if (tentStage) {
    stage = tentStage;
    stageSource = "tent";
  } else if (growStage) {
    stage = growStage;
    stageSource = "grow";
  }

  const plantStart = present(input.plant?.started_at);
  if (plantStart) {
    return {
      stage,
      stageSource,
      startedAt: plantStart,
      startedAtSource: "plant",
      day: plantStartDay(plantStart, now),
    };
  }

  const growStart = present(input.grow?.started_at);
  if (growStart) {
    return {
      stage,
      stageSource,
      startedAt: growStart,
      startedAtSource: "grow",
      day: resolveTimelineGrowDay(growStart, now),
    };
  }

  return { stage, stageSource, startedAt: null, startedAtSource: "none", day: null };
}

function growIdText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * A plant's effective grow, the same way `buildTimelinePlantTentLookup`
 * reads it: its own `grow_id`, or for a legacy null-grow plant its current
 * tent's grow. A malformed (non-null, non-string) `grow_id` resolves to null.
 */
export function resolveTimelineHeaderPlantGrowId(
  plantGrowId: unknown,
  plantTentGrowId: unknown,
): string | null {
  const direct = growIdText(plantGrowId);
  if (direct) return direct;
  if (plantGrowId != null) return null;
  return growIdText(plantTentGrowId);
}

/** True only when the record's grow is the Timeline's active grow. */
export function isTimelineHeaderRecordInGrow(
  recordGrowId: unknown,
  activeGrowId: unknown,
): boolean {
  const record = growIdText(recordGrowId);
  const active = growIdText(activeGrowId);
  return Boolean(record && active && record === active);
}
