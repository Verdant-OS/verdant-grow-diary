/**
 * alertFreshnessContext — pure helpers for Alerts page operator-context
 * messaging.
 *
 * Hard rules:
 *   - Pure: no I/O, no React, no Supabase, no time, no randomness.
 *   - Single source of truth for the alert-persistence freshness window:
 *     `STALE_THRESHOLD_MS` from `src/lib/sensorSnapshot.ts`.
 *   - Never relabels demo/stale/invalid/csv/diary/unknown telemetry as
 *     healthy or persistable.
 *   - Operator-facing copy must mirror `alertsCanPersist`. We never imply
 *     persistence for csv/sim/diary/unavailable or stale snapshots.
 */
import {
  STALE_THRESHOLD_MS,
  isStale,
  type SensorSnapshot,
  type SnapshotSource,
} from "@/lib/sensorSnapshot";
import { METRIC_LABELS, type GrowTargets } from "@/lib/environmentTargetComparison";
import {
  convertCelsiusForDisplay,
  type TemperatureUnitPreference,
} from "@/lib/temperatureUnitPreference";

/** Single shared freshness window, in minutes, for operator-facing copy. */
export const STALE_THRESHOLD_MINUTES = Math.round(STALE_THRESHOLD_MS / 60_000);

/** Short human label for the alert persistence window. */
export const FRESHNESS_WINDOW_LABEL = `${STALE_THRESHOLD_MINUTES}-minute alert window`;

export type LatestSnapshotFreshness =
  | "fresh"
  | "stale"
  | "missing"
  | "unavailable";

export interface ClassifyLatestSnapshotArgs {
  /** From useLatestSensorSnapshot — `"ok"` means data loaded successfully. */
  status: "idle" | "loading" | "ok" | "unavailable";
  snapshot: SensorSnapshot | null;
  /** Injectable for tests. */
  now?: number;
}

/**
 * Classify the latest sensor snapshot into a deterministic freshness state
 * for the Alerts page header and stale-badge copy.
 *
 * Rules:
 *   - status "unavailable" / "loading" / "idle" → "unavailable".
 *   - snapshot null OR source "unavailable" OR ts null → "missing".
 *   - source live | manual AND not stale → "fresh".
 *   - everything else (stale, sim/diary/csv, future-dated, etc.) → "stale".
 *     Stale never gets relabeled as healthy.
 */
export function classifyLatestSnapshotFreshness(
  args: ClassifyLatestSnapshotArgs,
): LatestSnapshotFreshness {
  if (args.status !== "ok") return "unavailable";
  const snap = args.snapshot;
  if (!snap || snap.source === "unavailable" || !snap.ts) return "missing";
  const now = args.now ?? Date.now();
  const stale = isStale(snap.ts, now);
  if (stale) return "stale";
  if (snap.source === "live" || snap.source === "manual") return "fresh";
  // sim / diary / csv: not eligible for persistence even when "fresh".
  return "stale";
}

/**
 * True only when the latest snapshot is a manual reading that is still
 * inside the persistable window. This is what we surface as "a recent
 * manual snapshot exists inside the N-minute alert window".
 */
export function hasRecentManualSnapshot(
  args: ClassifyLatestSnapshotArgs,
): boolean {
  if (args.status !== "ok") return false;
  const snap = args.snapshot;
  if (!snap || snap.source !== "manual" || !snap.ts) return false;
  const now = args.now ?? Date.now();
  return !isStale(snap.ts, now);
}

/**
 * Computes the exact same gate the alert persistence pipeline uses: a
 * snapshot can persist alerts only when status is loaded, source is
 * `live` or `manual`, and timestamp is inside the freshness window.
 */
export function snapshotAlertsCanPersist(
  args: ClassifyLatestSnapshotArgs,
): boolean {
  if (args.status !== "ok") return false;
  const snap = args.snapshot;
  if (!snap || !snap.ts) return false;
  if (snap.source !== "live" && snap.source !== "manual") return false;
  const now = args.now ?? Date.now();
  return !isStale(snap.ts, now);
}

/**
 * Operator-facing description of the latest snapshot, driven by
 * `alertsCanPersist` and the snapshot source. Never implies persistence
 * for csv / diary / sim / unavailable / stale snapshots.
 */
export function describeLatestSnapshotForAlerts(
  args: ClassifyLatestSnapshotArgs,
): string {
  if (args.status !== "ok") return "Snapshot status unavailable.";
  const snap = args.snapshot;
  if (!snap || snap.source === "unavailable" || !snap.ts) {
    return "No snapshot available. Enter a manual snapshot to check alerts.";
  }
  const persistableSource =
    snap.source === "live" || snap.source === "manual";
  if (!persistableSource) {
    return "Latest snapshot is for context only. Alerts persist only from fresh manual or live readings.";
  }
  const stale = isStale(snap.ts, args.now ?? Date.now());
  const sourceWord = snap.source === "live" ? "live" : "manual";
  if (stale) {
    return `Latest ${sourceWord} snapshot is stale. Enter a new manual snapshot inside the ${FRESHNESS_WINDOW_LABEL}.`;
  }
  return `Latest ${sourceWord} snapshot is fresh and can be checked against targets.`;
}

/* -------------------------------------------------------------------------- */
/* Alerts header context view-model                                            */
/* -------------------------------------------------------------------------- */

export interface AlertsHeaderRange {
  metricLabel: string;
  min: number | null;
  max: number | null;
  unit: string;
}

export interface LatestSnapshotDetail {
  /** Capitalized operator-facing source label: Manual / Live / CSV /
   * Diary / Simulated / Unknown. Never claims persistence. */
  sourceLabel: string;
  /** Pure relative-time string, e.g. "8 minutes ago" or "3 days ago".
   * Null when no usable timestamp. */
  capturedAgoText: string | null;
  insideWindow: boolean;
  canPersist: boolean;
  /** Prepared one-line operator-facing sentence — safe to render. */
  detailLine: string;
}

export interface AlertsHeaderContextViewModel {
  growName: string | null;
  stageLabel: string | null;
  ranges: {
    temp: AlertsHeaderRange | null;
    rh: AlertsHeaderRange | null;
    vpd: AlertsHeaderRange | null;
  };
  freshnessWindowLabel: string;
  latestFreshness: LatestSnapshotFreshness;
  latestSource: SnapshotSource | null;
  /** True only when the latest snapshot is persistable per the same rules
   * the alert pipeline uses. Presentation must never claim persistence
   * when this is false. */
  alertsCanPersist: boolean;
  /** Prepared one-line detail for the latest snapshot. Null when there
   * is no snapshot or status is unavailable/loading. */
  latestDetail: LatestSnapshotDetail | null;
}

const RH_UNIT = "%";
const VPD_UNIT = "kPa";

function roundOrNull(n: number | null): number | null {
  if (n === null || !Number.isFinite(n)) return null;
  return Math.round(n);
}

function buildTempRange(
  targets: GrowTargets | null,
  tempUnit: TemperatureUnitPreference,
): AlertsHeaderRange | null {
  if (!targets || !targets.temp) return null;
  const t = targets.temp;
  if (t.min === null && t.max === null) return null;
  if (tempUnit === "fahrenheit") {
    return {
      metricLabel: METRIC_LABELS.temp,
      min: roundOrNull(convertCelsiusForDisplay(t.min, "fahrenheit")),
      max: roundOrNull(convertCelsiusForDisplay(t.max, "fahrenheit")),
      unit: "°F",
    };
  }
  return { metricLabel: METRIC_LABELS.temp, min: t.min, max: t.max, unit: "°C" };
}

function buildRhRange(targets: GrowTargets | null): AlertsHeaderRange | null {
  if (!targets || !targets.rh) return null;
  const t = targets.rh;
  if (t.min === null && t.max === null) return null;
  return { metricLabel: METRIC_LABELS.rh, min: t.min, max: t.max, unit: RH_UNIT };
}

function buildVpdRange(targets: GrowTargets | null): AlertsHeaderRange | null {
  if (!targets || !targets.vpd) return null;
  const t = targets.vpd;
  if (t.min === null && t.max === null) return null;
  return { metricLabel: METRIC_LABELS.vpd, min: t.min, max: t.max, unit: VPD_UNIT };
}

export interface BuildAlertsHeaderContextArgs {
  growName: string | null;
  stage: string | null;
  targets: GrowTargets | null;
  snapshot: SensorSnapshot | null;
  status: "idle" | "loading" | "ok" | "unavailable";
  now?: number;
  /** Optional override; when omitted, defaults to Celsius display so the
   * pure helper stays free of localStorage reads. Wrappers should pass
   * the loaded preference. */
  tempUnit?: TemperatureUnitPreference;
}

export function buildAlertsHeaderContext(
  args: BuildAlertsHeaderContextArgs,
): AlertsHeaderContextViewModel {
  const latestFreshness = classifyLatestSnapshotFreshness({
    snapshot: args.snapshot,
    status: args.status,
    now: args.now,
  });
  const latestSource: SnapshotSource | null =
    args.status === "ok" && args.snapshot ? args.snapshot.source : null;
  const alertsCanPersist = snapshotAlertsCanPersist({
    snapshot: args.snapshot,
    status: args.status,
    now: args.now,
  });
  const tempUnit: TemperatureUnitPreference = args.tempUnit ?? "celsius";
  return {
    growName: args.growName ?? null,
    stageLabel: args.stage ? formatStageLabel(args.stage) : null,
    ranges: {
      temp: buildTempRange(args.targets, tempUnit),
      rh: buildRhRange(args.targets),
      vpd: buildVpdRange(args.targets),
    },
    freshnessWindowLabel: FRESHNESS_WINDOW_LABEL,
    latestFreshness,
    latestSource,
    alertsCanPersist,
    latestDetail: buildLatestSnapshotDetail({
      snapshot: args.snapshot,
      status: args.status,
      now: args.now,
    }),
  };
}

function formatStageLabel(stage: string): string {
  const s = stage.trim();
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* Latest snapshot detail                                                      */
/* -------------------------------------------------------------------------- */

const SOURCE_LABELS: Record<SnapshotSource, string> = {
  live: "Live",
  manual: "Manual",
  csv: "CSV",
  diary: "Diary",
  sim: "Simulated",
  unavailable: "Unknown",
};

/** Deterministic relative-time helper. Pure: no Intl.RelativeTimeFormat
 * locale variance. Returns null for null/invalid timestamps. */
export function formatCapturedAgo(
  capturedAtMs: number | null,
  now: number,
): string | null {
  if (capturedAtMs === null || !Number.isFinite(capturedAtMs)) return null;
  const diffMs = now - capturedAtMs;
  const future = diffMs < 0;
  const abs = Math.abs(diffMs);
  const mins = Math.round(abs / 60_000);
  let value: number;
  let unit: string;
  if (mins < 1) return future ? "in <1 minute" : "<1 minute ago";
  if (mins < 60) {
    value = mins;
    unit = "minute";
  } else if (mins < 60 * 24) {
    value = Math.round(mins / 60);
    unit = "hour";
  } else {
    value = Math.round(mins / (60 * 24));
    unit = "day";
  }
  const plural = value === 1 ? unit : `${unit}s`;
  return future ? `in ${value} ${plural}` : `${value} ${plural} ago`;
}

export function buildLatestSnapshotDetail(
  args: ClassifyLatestSnapshotArgs,
): LatestSnapshotDetail | null {
  if (args.status !== "ok") return null;
  const snap = args.snapshot;
  if (!snap || snap.source === "unavailable" || !snap.ts) return null;
  const now = args.now ?? Date.now();
  const ms = Date.parse(snap.ts);
  const capturedAgoText = formatCapturedAgo(Number.isFinite(ms) ? ms : null, now);
  const stale = isStale(snap.ts, now);
  const insideWindow = !stale;
  const persistableSource = snap.source === "live" || snap.source === "manual";
  const canPersist = persistableSource && insideWindow;
  const sourceLabel = SOURCE_LABELS[snap.source] ?? "Unknown";
  const captured = capturedAgoText ? `captured ${capturedAgoText}` : "captured time unknown";
  let detailLine: string;
  if (!persistableSource) {
    detailLine = `Latest snapshot: ${sourceLabel} · ${captured} · context only. Alerts persist only from fresh manual or live readings.`;
  } else if (!insideWindow) {
    detailLine = `Latest snapshot: ${sourceLabel} · ${captured} · outside ${FRESHNESS_WINDOW_LABEL}. Enter a fresh manual snapshot to persist alerts.`;
  } else {
    detailLine = `Latest snapshot: ${sourceLabel} · ${captured} · inside ${FRESHNESS_WINDOW_LABEL} · eligible for alert persistence.`;
  }
  return { sourceLabel, capturedAgoText, insideWindow, canPersist, detailLine };
}

/* -------------------------------------------------------------------------- */
/* Unscoped Alerts grow context selection                                      */
/* -------------------------------------------------------------------------- */

export interface AlertsGrowCandidate {
  id: string;
  name: string | null;
  stage?: string | null;
  /** Optional — used as deterministic tiebreaker for "most recently updated". */
  updated_at?: string | null;
}

export interface PickAlertsGrowContextArgs {
  scopedGrowId?: string | null;
  activeGrowId?: string | null;
  grows: AlertsGrowCandidate[];
  /** Optional — grow ids known to have open alerts. */
  growIdsWithOpenAlerts?: ReadonlyArray<string>;
}

export type AlertsGrowContextReason =
  | "scoped"
  | "active"
  | "open-alerts"
  | "most-recent"
  | "first";

export interface AlertsGrowContextSelection {
  growId: string;
  growName: string | null;
  stage: string | null;
  isFallback: boolean;
  reason: AlertsGrowContextReason;
}

/**
 * Deterministically pick the most relevant grow context for the Alerts
 * header. Preference order:
 *   1. scoped grow (from URL) — exact match must exist in `grows`.
 *   2. active grow — exact match must exist in `grows`.
 *   3. any grow with open alerts (id-sorted for determinism).
 *   4. most recently updated grow (by updated_at; id tiebreak).
 *   5. first grow by id.
 * Returns null when no candidate grow exists.
 */
export function pickAlertsGrowContext(
  args: PickAlertsGrowContextArgs,
): AlertsGrowContextSelection | null {
  const grows = args.grows ?? [];
  if (grows.length === 0) return null;

  const findById = (id: string | null | undefined) =>
    id ? grows.find((g) => g.id === id) ?? null : null;

  const scoped = findById(args.scopedGrowId);
  if (scoped) return toSelection(scoped, "scoped", false);

  const active = findById(args.activeGrowId);
  if (active) return toSelection(active, "active", false);

  const openAlertIds = new Set(args.growIdsWithOpenAlerts ?? []);
  if (openAlertIds.size > 0) {
    const open = grows
      .filter((g) => openAlertIds.has(g.id))
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (open) return toSelection(open, "open-alerts", true);
  }

  const withUpdates = grows
    .filter((g) => typeof g.updated_at === "string" && g.updated_at)
    .sort((a, b) => {
      const ta = Date.parse(a.updated_at as string);
      const tb = Date.parse(b.updated_at as string);
      if (Number.isFinite(tb) && Number.isFinite(ta) && tb !== ta) return tb - ta;
      return a.id.localeCompare(b.id);
    });
  if (withUpdates[0]) return toSelection(withUpdates[0], "most-recent", true);

  const first = [...grows].sort((a, b) => a.id.localeCompare(b.id))[0];
  return toSelection(first, "first", true);
}

function toSelection(
  g: AlertsGrowCandidate,
  reason: AlertsGrowContextReason,
  isFallback: boolean,
): AlertsGrowContextSelection {
  return {
    growId: g.id,
    growName: g.name ?? null,
    stage: g.stage ?? null,
    isFallback,
    reason,
  };
}
