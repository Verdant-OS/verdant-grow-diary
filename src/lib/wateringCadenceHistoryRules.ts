/**
 * wateringCadenceHistoryRules — pure, read-only watering history strip.
 *
 * Surfaces last watering + arithmetic intervals between recorded waterings.
 * Never infers a schedule, target, dryback, readiness, "overdue", or action.
 * No I/O, no React, no device control.
 */

export const WATERING_CADENCE_HISTORY_TITLE = "Watering history";
export const WATERING_CADENCE_HISTORY_CAVEAT =
  "History only — intervals are arithmetic from recorded waterings, not a schedule or recommendation." as const;
export const WATERING_CADENCE_EMPTY_COPY = "No watering recorded yet for this scope.";
export const WATERING_CADENCE_UNMEASURED_VOLUME = "Volume not recorded";
export const WATERING_CADENCE_RECENT_CAP = 5;

export interface WateringCadenceEventInput {
  readonly id: string;
  readonly kind: "watering" | "feeding";
  /** ISO timestamp when valid; null/invalid rows are skipped for timing. */
  readonly occurredAt: string | null;
  readonly volumeMl: number | null;
  readonly sourceLabel: string;
}

export interface WateringCadenceHistoryOptions {
  /** Injectable clock for deterministic tests. */
  readonly now?: number;
  readonly recentCap?: number;
}

export interface WateringCadenceLastWatering {
  readonly occurredAt: string;
  readonly relativeLabel: string;
  readonly absoluteLabel: string;
  readonly volumeLabel: string;
  readonly sourceLabel: string;
}

export interface WateringCadenceInterval {
  readonly label: string;
  readonly valueLabel: string;
}

export interface WateringCadenceRecentRow {
  readonly id: string;
  readonly relativeLabel: string;
  readonly absoluteLabel: string;
  readonly volumeLabel: string;
  readonly sourceLabel: string;
}

export type WateringCadenceHistoryStatus = "empty" | "history";

export interface WateringCadenceHistoryViewModel {
  readonly status: WateringCadenceHistoryStatus;
  readonly title: string;
  readonly lastWatering: WateringCadenceLastWatering | null;
  /** Arithmetic gap between the two newest dated waterings. */
  readonly lastInterval: WateringCadenceInterval | null;
  readonly recentWaterings: readonly WateringCadenceRecentRow[];
  readonly wateringCount: number;
  readonly emptyCopy: string | null;
  readonly caveat: typeof WATERING_CADENCE_HISTORY_CAVEAT;
}

function trimId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function parseOccurredAt(raw: string | null | undefined): { iso: string; ms: number } | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  const iso = new Date(ms).toISOString();
  return { iso, ms };
}

function volumeLabel(volumeMl: number | null | undefined): string {
  if (typeof volumeMl !== "number" || !Number.isFinite(volumeMl)) {
    return WATERING_CADENCE_UNMEASURED_VOLUME;
  }
  if (volumeMl <= 0) return WATERING_CADENCE_UNMEASURED_VOLUME;
  // Preserve integer-looking volumes without inventing precision.
  const rounded = Number.isInteger(volumeMl) ? String(volumeMl) : String(volumeMl);
  return `${rounded} ml`;
}

/**
 * Compact duration for history (not a schedule). Uses whole units only.
 */
export function formatWateringCadenceDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w`;
}

export function formatWateringCadenceRelative(
  occurredMs: number,
  nowMs: number,
): string {
  const age = Math.max(0, nowMs - occurredMs);
  const core = formatWateringCadenceDuration(age);
  if (core === "just now") return "just now";
  if (core === "—") return "Unknown time";
  return `${core} ago`;
}

function formatAbsoluteUtc(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    });
  } catch {
    return iso;
  }
}

interface NormalizedWatering {
  id: string;
  occurredAt: string;
  occurredMs: number;
  volumeMl: number | null;
  sourceLabel: string;
}

/**
 * Build the read-only watering cadence / last-water strip view-model.
 * Feeding events are ignored for cadence (water-only memory).
 */
export function buildWateringCadenceHistory(
  events: readonly WateringCadenceEventInput[] | null | undefined,
  options: WateringCadenceHistoryOptions = {},
): WateringCadenceHistoryViewModel {
  const now = Number.isFinite(options.now) ? (options.now as number) : Date.now();
  const cap = Math.max(1, Math.floor(options.recentCap ?? WATERING_CADENCE_RECENT_CAP));

  const waterings: NormalizedWatering[] = [];
  for (const raw of Array.isArray(events) ? events : []) {
    if (!raw || raw.kind !== "watering") continue;
    const id = trimId(raw.id);
    if (!id) continue;
    const occurred = parseOccurredAt(raw.occurredAt);
    if (!occurred) continue;
    const sourceLabel =
      typeof raw.sourceLabel === "string" && raw.sourceLabel.trim()
        ? raw.sourceLabel.trim()
        : "Source unavailable";
    const volumeMl =
      typeof raw.volumeMl === "number" && Number.isFinite(raw.volumeMl) ? raw.volumeMl : null;
    waterings.push({
      id,
      occurredAt: occurred.iso,
      occurredMs: occurred.ms,
      volumeMl,
      sourceLabel,
    });
  }

  // Newest first, stable id DESC tie-break.
  waterings.sort((a, b) => {
    if (a.occurredMs !== b.occurredMs) return b.occurredMs - a.occurredMs;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });

  if (waterings.length === 0) {
    return {
      status: "empty",
      title: WATERING_CADENCE_HISTORY_TITLE,
      lastWatering: null,
      lastInterval: null,
      recentWaterings: [],
      wateringCount: 0,
      emptyCopy: WATERING_CADENCE_EMPTY_COPY,
      caveat: WATERING_CADENCE_HISTORY_CAVEAT,
    };
  }

  const newest = waterings[0];
  const previous = waterings[1] ?? null;

  const lastWatering: WateringCadenceLastWatering = {
    occurredAt: newest.occurredAt,
    relativeLabel: formatWateringCadenceRelative(newest.occurredMs, now),
    absoluteLabel: formatAbsoluteUtc(newest.occurredAt),
    volumeLabel: volumeLabel(newest.volumeMl),
    sourceLabel: newest.sourceLabel,
  };

  let lastInterval: WateringCadenceInterval | null = null;
  if (previous) {
    const gap = Math.max(0, newest.occurredMs - previous.occurredMs);
    lastInterval = {
      label: "Interval since previous watering",
      valueLabel: formatWateringCadenceDuration(gap),
    };
  }

  const recentWaterings: WateringCadenceRecentRow[] = waterings.slice(0, cap).map((w) => ({
    id: w.id,
    relativeLabel: formatWateringCadenceRelative(w.occurredMs, now),
    absoluteLabel: formatAbsoluteUtc(w.occurredAt),
    volumeLabel: volumeLabel(w.volumeMl),
    sourceLabel: w.sourceLabel,
  }));

  return {
    status: "history",
    title: WATERING_CADENCE_HISTORY_TITLE,
    lastWatering,
    lastInterval,
    recentWaterings,
    wateringCount: waterings.length,
    emptyCopy: null,
    caveat: WATERING_CADENCE_HISTORY_CAVEAT,
  };
}

/** Map irrigation ledger rows into cadence inputs without dropping feed provenance. */
export function cadenceEventsFromIrrigationLedger(
  rows: readonly {
    id: string;
    kind: "watering" | "feeding";
    occurredAt: string | null;
    volumeMl: number | null;
    sourceLabel: string;
  }[] | null | undefined,
): WateringCadenceEventInput[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    occurredAt: row.occurredAt,
    volumeMl: row.volumeMl,
    sourceLabel: row.sourceLabel,
  }));
}
