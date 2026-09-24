/**
 * flowerWindowCalendarRules — derive plant-day / flower-day labels and a
 * UTC flower-window band for the read-only cultivation calendar.
 *
 * Pure: no React, no I/O, no ambient clock, no writes. Flower age always
 * comes from `flowerFlipAt`, never from `plantStartedAt`. Duration is only
 * the caller-supplied SET (or a caller-labeled suggested value) — this
 * module never silently treats the flower preset 45–75 range as a grower
 * schedule.
 */
import {
  calculatePlantRelativeDay,
  calculateStageRelativeDay,
} from "@/lib/relativeStageTimelineRules";

export const FLOWER_WINDOW_PALETTE_KEY = "flower" as const;
export const FLOWER_WINDOW_SUGGESTED_DURATION_LABEL = "suggested — not your schedule";
export const FLOWER_WINDOW_MAX_DURATION_DAYS = 366;

export type FlowerWindowDurationKind = "grower_set" | "suggested";
export type FlowerWindowDurationSource = FlowerWindowDurationKind | "missing";
export type FlowerWindowBandStatus = "derived" | "null";

export interface FlowerWindowCalendarInput {
  plantStartedAt?: string | number | Date | null | undefined;
  flowerFlipAt?: string | number | Date | null | undefined;
  durationDays?: number | null | undefined;
  /**
   * How the caller obtained `durationDays`. Omit or pass null when duration
   * is missing. `"suggested"` must be labeled in the UI; never implied.
   */
  durationKind?: FlowerWindowDurationKind | null | undefined;
  now?: string | number | Date | null | undefined;
}

export interface FlowerWindowHonesty {
  plantDayKnown: boolean;
  flowerDayKnown: boolean;
  durationSource: FlowerWindowDurationSource;
  band: FlowerWindowBandStatus;
  /** Always false. Plant start is never reused as flower age. */
  usedPlantStartAsFlowerAge: false;
}

export interface FlowerWindowCalendar {
  plantDay: number | null;
  flowerDay: number | null;
  durationDays: number | null;
  bandDateKeys: readonly string[];
  paletteKey: typeof FLOWER_WINDOW_PALETTE_KEY | null;
  plantDayLabel: string | null;
  flowerDayLabel: string | null;
  durationHonestyLabel: string | null;
  honesty: FlowerWindowHonesty;
}

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function toEpoch(value: string | number | Date | null | undefined): number | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  return null;
}

function formatUtcDateKey(date: Date): string | null {
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) return null;
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  if (year < 1000 || year > 9999) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function utcDateKeyFromInstant(value: string | number | Date | null | undefined): string | null {
  if (typeof value === "string") {
    const match = DATE_KEY_PATTERN.exec(value.trim());
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const date = new Date(Date.UTC(year, month - 1, day));
      const normalized = formatUtcDateKey(date);
      return normalized === value.trim() ? normalized : null;
    }
  }
  const epoch = toEpoch(value);
  if (epoch == null) return null;
  return formatUtcDateKey(new Date(epoch));
}

function normalizeDurationDays(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
  if (value < 1 || value > FLOWER_WINDOW_MAX_DURATION_DAYS) return null;
  return value;
}

function buildBandDateKeys(startKey: string, durationDays: number): string[] {
  const match = DATE_KEY_PATTERN.exec(startKey);
  if (!match) return [];
  const start = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (!Number.isFinite(start)) return [];

  const keys: string[] = [];
  for (let offset = 0; offset < durationDays; offset += 1) {
    const key = formatUtcDateKey(new Date(start + offset * DAY_MS));
    if (!key) return [];
    keys.push(key);
  }
  return keys;
}

function emptyWindow(durationSource: FlowerWindowDurationSource): FlowerWindowCalendar {
  return {
    plantDay: null,
    flowerDay: null,
    durationDays: null,
    bandDateKeys: [],
    paletteKey: null,
    plantDayLabel: null,
    flowerDayLabel: null,
    durationHonestyLabel:
      durationSource === "suggested" ? FLOWER_WINDOW_SUGGESTED_DURATION_LABEL : null,
    honesty: {
      plantDayKnown: false,
      flowerDayKnown: false,
      durationSource,
      band: "null",
      usedPlantStartAsFlowerAge: false,
    },
  };
}

/**
 * Derive plant-day N, flower-day N of D, and the inclusive UTC flower band.
 * Invalid flip or duration fails closed to an empty band. Missing plant start
 * yields a null plant day, never a fabricated Day 0.
 */
export function deriveFlowerWindowCalendar(
  input: FlowerWindowCalendarInput | null | undefined,
): FlowerWindowCalendar {
  if (!input) return emptyWindow("missing");

  const durationDays = normalizeDurationDays(input.durationDays);
  const durationKind =
    input.durationKind === "suggested" || input.durationKind === "grower_set"
      ? input.durationKind
      : durationDays != null
        ? "grower_set"
        : null;
  const durationSource: FlowerWindowDurationSource =
    durationDays == null ? "missing" : (durationKind ?? "grower_set");

  const plantDay = calculatePlantRelativeDay({
    plantStartedAt: input.plantStartedAt,
    eventAt: input.now,
  });
  const flowerDay = calculateStageRelativeDay({
    stageStartedAt: input.flowerFlipAt,
    eventAt: input.now,
  });

  const flipKey = utcDateKeyFromInstant(input.flowerFlipAt);
  const bandDateKeys =
    flipKey && durationDays != null ? buildBandDateKeys(flipKey, durationDays) : [];
  const bandDerived = bandDateKeys.length > 0;

  return {
    plantDay,
    flowerDay,
    durationDays,
    bandDateKeys,
    paletteKey: bandDerived ? FLOWER_WINDOW_PALETTE_KEY : null,
    plantDayLabel: plantDay == null ? null : `Plant day ${plantDay}`,
    flowerDayLabel:
      flowerDay == null || durationDays == null
        ? null
        : `Flower day ${flowerDay} of ${durationDays}`,
    durationHonestyLabel:
      durationSource === "suggested" ? FLOWER_WINDOW_SUGGESTED_DURATION_LABEL : null,
    honesty: {
      plantDayKnown: plantDay != null,
      flowerDayKnown: flowerDay != null,
      durationSource,
      band: bandDerived ? "derived" : "null",
      usedPlantStartAsFlowerAge: false,
    },
  };
}
